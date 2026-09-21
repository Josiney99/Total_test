import inquirer from 'inquirer';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const GB = 1024 ** 3;

// ---------- utilitários ----------

// Executa um comando PowerShell e devolve o resultado (JSON) sempre como array
function powershell(comando) {
  const saida = execFileSync('powershell', ['-NoProfile', '-Command', comando], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return saida ? [].concat(JSON.parse(saida)) : [];
}

// Soma os tempos de todos os núcleos (usado para calcular o uso da CPU)
function amostraCpu() {
  return os.cpus().reduce(
    (acc, c) => {
      acc.total += Object.values(c.times).reduce((a, b) => a + b, 0);
      acc.ocioso += c.times.idle;
      return acc;
    },
    { total: 0, ocioso: 0 }
  );
}

// Mede o uso da CPU (%) comparando duas amostras
async function usoCpu(ms) {
  const antes = amostraCpu();
  await new Promise((resolve) => setTimeout(resolve, ms));
  const depois = amostraCpu();
  const total = depois.total - antes.total;
  const ocioso = depois.ocioso - antes.ocioso;
  return total > 0 ? (1 - ocioso / total) * 100 : 0;
}

// ---------- testes ----------

async function testeCPU(detalhado = false) {
  const cpus = os.cpus();
  console.log('\n[CPU]');
  console.log(`  Modelo: ${cpus[0].model.trim()}`);
  console.log(`  Núcleos lógicos: ${cpus.length}`);
  const uso = await usoCpu(detalhado ? 3000 : 1000);
  console.log(`  Uso atual: ${uso.toFixed(1)}%`);
  if (detalhado) console.log(`  Clock informado: ${cpus[0].speed} MHz`);
}

function testeRAM(detalhado = false) {
  const total = os.totalmem();
  const livre = os.freemem();
  const usada = total - livre;
  console.log('\n[RAM]');
  console.log(`  Total: ${(total / GB).toFixed(1)} GB`);
  console.log(`  Em uso: ${(usada / GB).toFixed(1)} GB (${((usada / total) * 100).toFixed(0)}%)`);
  if (detalhado) console.log(`  Livre: ${(livre / GB).toFixed(1)} GB`);
}

function testeDisco(detalhado = false) {
  console.log('\n[SSD/HD]');
  try {
    const discos = powershell(
      'Get-PhysicalDisk | Select-Object FriendlyName,MediaType,HealthStatus,Size | ConvertTo-Json'
    );
    if (!discos.length) return console.log('  Nenhum disco encontrado.');

    for (const d of discos) {
      console.log(
        `  ${d.FriendlyName} | ${d.MediaType} | ${(d.Size / GB).toFixed(0)} GB | saúde: ${d.HealthStatus}`
      );
    }

    if (detalhado) {
      const volumes = powershell(
        "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json"
      );
      for (const v of volumes) {
        console.log(
          `  Unidade ${v.DeviceID} → livre: ${(v.FreeSpace / GB).toFixed(1)} GB de ${(v.Size / GB).toFixed(1)} GB`
        );
      }
    }
  } catch {
    console.log('  Não foi possível ler os discos (requer Windows com PowerShell).');
  }
}

const STATUS_BATERIA = {
  1: 'descarregando',
  2: 'ligada na tomada',
  3: 'totalmente carregada',
  4: 'baixa',
  5: 'crítica',
  6: 'carregando',
  7: 'carregando (alta)',
  8: 'carregando (baixa)',
  9: 'carregando (crítica)',
  11: 'parcialmente carregada',
};

function testeBateria(detalhado = false) {
  console.log('\n[BATERIA]');
  try {
    const baterias = powershell(
      'Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus,EstimatedRunTime | ConvertTo-Json'
    );
    if (!baterias.length) return console.log('  Nenhuma bateria detectada.');

    for (const b of baterias) {
      console.log(`  Carga: ${b.EstimatedChargeRemaining}%`);
      console.log(`  Status: ${STATUS_BATERIA[b.BatteryStatus] ?? 'desconhecido'}`);
      // 71582788 é o valor que o Windows usa quando está na tomada
      if (detalhado && b.EstimatedRunTime && b.EstimatedRunTime < 71582788) {
        console.log(`  Tempo restante estimado: ${b.EstimatedRunTime} min`);
      }
    }
  } catch {
    console.log('  Não foi possível ler a bateria (requer Windows com PowerShell).');
  }
}

async function testeCompleto(detalhado) {
  await testeCPU(detalhado);
  testeRAM(detalhado);
  testeDisco(detalhado);
  testeBateria(detalhado);
}

// ---------- menu ----------

async function executar(option) {
  switch (option) {
    case 'rapido':
      return testeCompleto(false);
    case 'avancado':
      return testeCompleto(true);
    case 'cpu':
      return testeCPU(true);
    case 'ram':
      return testeRAM(true);
    case 'disco':
      return testeDisco(true);
    case 'bateria':
      return testeBateria(true);
  }
}

async function menuPrincipal() {
  while (true) {
    console.clear();
    const { option } = await inquirer.prompt([
      {
        type: 'select',
        name: 'option',
        message: 'Selecione o tipo do teste :',
        choices: [
          { name: 'Teste rápido', value: 'rapido' },
          { name: 'Teste avançado', value: 'avancado' },
          { name: 'CPU', value: 'cpu' },
          { name: 'RAM', value: 'ram' },
          { name: 'SSD/HD', value: 'disco' },
          { name: 'BATERIA', value: 'bateria' },
          { name: 'Sair', value: 'sair' },
        ],
      },
    ]);

    if (option === 'sair') {
      console.log('Até logo!');
      return;
    }

    await executar(option);

    await inquirer.prompt([
      { type: 'input', name: 'voltar', message: 'Pressione Enter para voltar ao menu' },
    ]);
  }
}

menuPrincipal().catch((err) => {
  // Ctrl+C dentro de um prompt lança este erro; tratamos como saída normal
  if (err.name === 'ExitPromptError') {
    console.log('\nAté logo!');
  } else {
    throw err;
  }
});