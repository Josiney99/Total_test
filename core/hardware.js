import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import os from 'node:os';

/**
 * TEST TOTAL - core/hardware.js
 *
 * Detecção e identificação do equipamento (CPU, RAM, discos, fabricante,
 * modelo e serial). Somente LEITURA: nenhum teste é executado aqui.
 *
 * Fontes de dados (Linux):
 *   - /sys/class/dmi/id/*  e  dmidecode  → fabricante, modelo, serial
 *   - lscpu                              → CPU
 *   - dmidecode -t memory                → módulos de RAM
 *   - lsblk                              → discos
 *
 * Se algum comando falhar ou não existir (ex.: desenvolvendo no Windows),
 * o módulo não quebra: devolve o que conseguir (via os do Node) e registra
 * a limitação em `avisos`.
 *
 * Contrato usado pelo index.js:
 *   detectarHardware() → {
 *     fabricante, modelo, serial,
 *     cpu:    string,
 *     ram:    string,
 *     discos: string[],          // texto pronto para exibir
 *     detalhes: { cpu, ram, discos },  // dados estruturados p/ os módulos
 *     avisos: string[]
 *   }
 */

const execFileAsync = promisify(execFile);

// ---------- utilitários ----------

/** Executa um comando e devolve o stdout, ou null se falhar. */
async function run(cmd, args = [], timeout = 8000) {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' }, // saída em inglês, fácil de interpretar
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function lerArquivo(caminho) {
  try {
    return (await readFile(caminho, 'utf8')).trim();
  } catch {
    return null;
  }
}

const VALORES_INVALIDOS = [
  'to be filled by o.e.m.',
  'to be filled by oem',
  'default string',
  'system serial number',
  'system product name',
  'system manufacturer',
  'not specified',
  'not applicable',
  'none',
  'unknown',
  'n/a',
  '0',
  '',
];

/** Remove valores inúteis que fabricantes deixam na BIOS. */
function limpar(valor) {
  if (valor == null) return null;
  const v = String(valor).trim();
  return VALORES_INVALIDOS.includes(v.toLowerCase()) ? null : v;
}

function formatarTamanho(bytes) {
  const n = Number(bytes);
  if (!n) return 'N/D';
  const gb = n / 1e9;
  return gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${Math.round(gb)} GB`;
}

// ---------- fabricante / modelo / serial ----------

async function lerDmi(arquivoSys, chaveDmidecode) {
  let valor = limpar(await lerArquivo(`/sys/class/dmi/id/${arquivoSys}`));
  if (!valor) valor = limpar(await run('dmidecode', ['-s', chaveDmidecode]));
  return valor;
}

async function detectarSistema() {
  const [fabricante, modelo, serial] = await Promise.all([
    lerDmi('sys_vendor', 'system-manufacturer'),
    lerDmi('product_name', 'system-product-name'),
    lerDmi('product_serial', 'system-serial-number'),
  ]);
  return { fabricante, modelo, serial };
}

// ---------- CPU ----------

async function detectarCpu() {
  const cpusNode = os.cpus();
  let modelo = cpusNode[0]?.model?.trim() ?? null;
  let threads = cpusNode.length || null;
  let nucleos = null;

  const saida = await run('lscpu');
  if (saida) {
    const campo = (nome) =>
      saida.match(new RegExp(`^${nome}:\\s*(.+)$`, 'm'))?.[1]?.trim();

    modelo = campo('Model name') ?? modelo;
    const sockets = Number(campo('Socket\\(s\\)'));
    const porSocket = Number(campo('Core\\(s\\) per socket'));
    if (sockets && porSocket) nucleos = sockets * porSocket;
    const cpuTotal = Number(campo('CPU\\(s\\)'));
    if (cpuTotal) threads = cpuTotal;
  }

  let texto = modelo ?? 'N/D';
  if (nucleos && threads) texto += ` (${nucleos} núcleos / ${threads} threads)`;
  else if (threads) texto += ` (${threads} threads)`;

  return { modelo, nucleos, threads, texto };
}

// ---------- RAM ----------

function lerBloco(bloco) {
  const campos = {};
  for (const linha of bloco.split('\n')) {
    const m = linha.trim().match(/^([^:]+):\s*(.*)$/);
    if (m) campos[m[1].trim()] = m[2].trim();
  }
  return campos;
}

function tamanhoEmGB(texto) {
  const m = texto?.match(/^(\d+)\s*(MB|GB|TB)$/i);
  if (!m) return 0;
  const valor = Number(m[1]);
  const unidade = m[2].toUpperCase();
  if (unidade === 'TB') return valor * 1024;
  if (unidade === 'MB') return valor / 1024;
  return valor;
}

async function detectarRam() {
  const totalOsGB = Math.round(os.totalmem() / 1024 ** 3);
  const saida = await run('dmidecode', ['-t', 'memory']);

  if (!saida) {
    return {
      totalGB: totalOsGB,
      modulos: [],
      ecc: null,
      texto: `~${totalOsGB} GB (detalhes dos módulos indisponíveis)`,
    };
  }

  const blocos = saida.split(/\n\s*\n/);

  // ECC vem do "Physical Memory Array"
  let ecc = null;
  const matriz = blocos.find((b) => b.includes('Physical Memory Array'));
  if (matriz) {
    const tipo = lerBloco(matriz)['Error Correction Type'];
    ecc = tipo ? tipo.toLowerCase() !== 'none' : null;
  }

  // Cada "Memory Device" é um slot; slots vazios são descartados
  const modulos = blocos
    .filter((b) => b.includes('Memory Device'))
    .map(lerBloco)
    .filter((c) => tamanhoEmGB(c.Size) > 0)
    .map((c) => ({
      slot: c.Locator ?? null,
      capacidadeGB: tamanhoEmGB(c.Size),
      tipo: limpar(c.Type),
      velocidade: limpar(c['Configured Memory Speed']) ?? limpar(c.Speed),
      fabricante: limpar(c.Manufacturer),
      partNumber: limpar(c['Part Number']),
      serial: limpar(c['Serial Number']),
    }));

  if (modulos.length === 0) {
    return {
      totalGB: totalOsGB,
      modulos: [],
      ecc,
      texto: `~${totalOsGB} GB (módulos não identificados)`,
    };
  }

  const totalGB = modulos.reduce((soma, m) => soma + m.capacidadeGB, 0);
  const tipo = modulos[0].tipo ?? '';
  const velocidade = modulos[0].velocidade ?? '';
  const detalhe = [
    `${modulos.length} módulo${modulos.length > 1 ? 's' : ''}`,
    tipo,
    velocidade,
    ecc ? 'ECC' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    totalGB,
    modulos,
    ecc,
    texto: `${Math.round(totalGB)} GB (${detalhe})`,
  };
}

// ---------- Discos ----------

/** Descobre o disco de onde o TEST TOTAL foi iniciado (o pendrive). */
async function detectarDiscoDeBoot() {
  for (const ponto of ['/run/live/medium', '/cdrom', '/']) {
    const origem = await run('findmnt', ['-no', 'SOURCE', ponto]);
    if (origem && origem.startsWith('/dev/')) {
      const pai = await run('lsblk', ['-no', 'PKNAME', origem]);
      const nome = pai?.split('\n')[0]?.trim();
      return nome || origem.replace('/dev/', '');
    }
  }
  return null;
}

function classificarDisco(d) {
  const nome = String(d.name ?? '');
  const tran = String(d.tran ?? '').toLowerCase();
  const rotativo = d.rota === true || d.rota === 1 || d.rota === '1';

  if (nome.startsWith('nvme') || tran === 'nvme') return 'SSD NVMe';
  if (tran === 'usb') return 'USB';
  if (rotativo) return 'HDD';
  if (tran === 'sata' || tran === 'ata') return 'SSD SATA';
  return 'SSD';
}

async function detectarDiscos() {
  const saida = await run('lsblk', [
    '-J',
    '-b',
    '-d',
    '-o',
    'NAME,SIZE,MODEL,SERIAL,TRAN,ROTA,TYPE',
  ]);
  if (!saida) return null; // lsblk indisponível

  let lista;
  try {
    lista = JSON.parse(saida).blockdevices ?? [];
  } catch {
    return null;
  }

  const boot = await detectarDiscoDeBoot();

  return lista
    .filter((d) => d.type === 'disk')
    .map((d) => ({
      dispositivo: `/dev/${d.name}`,
      modelo: limpar(d.model),
      serial: limpar(d.serial),
      tamanhoBytes: Number(d.size) || 0,
      tamanho: formatarTamanho(d.size),
      tipo: classificarDisco(d),
      interface: limpar(d.tran),
      boot: boot === d.name,
    }));
}

function descreverDisco(d) {
  const nome = d.modelo ?? 'Modelo N/D';
  const marca = d.boot ? ' [BOOT - pendrive TEST TOTAL]' : '';
  return `${d.dispositivo} — ${nome} (${d.tipo}, ${d.tamanho})${marca}`;
}

// ---------- função principal ----------

export async function detectarHardware() {
  const avisos = [];

  if (process.platform !== 'linux') {
    avisos.push(
      `Sistema ${process.platform}: detecção completa só funciona no Linux (produto final).`
    );
  }

  const [sistema, cpu, ram, discos] = await Promise.all([
    detectarSistema(),
    detectarCpu(),
    detectarRam(),
    detectarDiscos(),
  ]);

  if (!sistema.fabricante && !sistema.modelo) {
    avisos.push('Fabricante/modelo indisponíveis (requer Linux e permissão root).');
  }
  if (!sistema.serial) {
    avisos.push('Número de série indisponível (a BIOS pode não informar ou falta root).');
  }
  if (discos === null) {
    avisos.push('Não foi possível listar discos (lsblk indisponível).');
  }

  const listaDiscos = discos ?? [];

  return {
    fabricante: sistema.fabricante,
    modelo: sistema.modelo,
    serial: sistema.serial,
    cpu: cpu.texto,
    ram: ram.texto,
    discos: listaDiscos.map(descreverDisco),
    detalhes: {
      cpu,
      ram,
      discos: listaDiscos,
    },
    avisos,
  };
}