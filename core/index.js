import { readFileSync } from 'node:fs';
import inquirer from 'inquirer';

/**
 * TEST TOTAL
 * Sistema Profissional de Diagnóstico e Stress Test de Hardware
 *
 * Ponto de entrada principal do sistema.
 *
 * Fluxo oficial (Fase 1):
 *   BOOT → DETECTAR HARDWARE → MENU → TESTES → STRESS → ANÁLISE → RELATÓRIO → APTO/NÃO APTO
 *
 * Responsabilidade deste arquivo:
 * - Ler a versão do package.json
 * - Detectar o hardware (via core/hardware.js, quando existir)
 * - Exibir o cabeçalho com a identificação do equipamento
 * - Exibir o menu principal e encaminhar a escolha
 *
 * Os testes de hardware NÃO devem ser implementados neste arquivo.
 */

// ---------- versão (vem do package.json) ----------

const PROJECT_NAME = 'TEST TOTAL';

function lerVersao() {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = lerVersao();

// ---------- detecção de hardware ----------

/**
 * Tenta carregar core/hardware.js. Se ele ainda não existir,
 * o sistema continua funcionando sem a identificação do equipamento.
 *
 * Contrato esperado de hardware.js:
 *   export async function detectarHardware()
 *   → { fabricante, modelo, serial, cpu, ram, discos: [] }
 */
async function detectarHardware() {
  try {
    const modulo = await import('./hardware.js');
    if (typeof modulo.detectarHardware === 'function') {
      return await modulo.detectarHardware();
    }
    return null;
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') return null; // ainda não criado
    return { erro: err.message };
  }
}

// ---------- interface ----------

function mostrarCabecalho(hw) {
  console.log('');
  console.log('========================================');
  console.log('              TEST TOTAL');
  console.log('     Hardware Diagnostic System');
  console.log('========================================');
  console.log(`Versão : ${VERSION}`);
  console.log('----------------------------------------');

  if (!hw) {
    console.log('Equipamento : detecção indisponível (hardware.js não criado)');
  } else if (hw.erro) {
    console.log(`Equipamento : falha na detecção (${hw.erro})`);
  } else {
    console.log(`Fabricante : ${hw.fabricante ?? 'N/D'}`);
    console.log(`Modelo     : ${hw.modelo ?? 'N/D'}`);
    console.log(`Serial     : ${hw.serial ?? 'N/D'}`);
    console.log(`CPU        : ${hw.cpu ?? 'N/D'}`);
    console.log(`RAM        : ${hw.ram ?? 'N/D'}`);
    const discos = Array.isArray(hw.discos) ? hw.discos : [];
    if (discos.length === 0) {
      console.log('Discos     : nenhum disco detectado');
    } else {
      discos.forEach((d, i) => {
        console.log(`Disco ${i + 1}    : ${d}`);
      });
    }
  }
  if (hw?.avisos?.length) {
    console.log('----------------------------------------');
    hw.avisos.forEach((a) => console.log(`⚠ ${a}`));
  }
  console.log('========================================');
  console.log('');
}

// ---------- ações ----------

const NOMES = {
  completo: 'Teste Completo',
  rapido: 'Diagnóstico rápido (meta: até 30 min)',
  diagnostico: 'Diagnóstico completo (meta: até 2 h)',
  stress: 'Stress Test',
  personalizado: 'Modo personalizado',
  cpu: 'CPU',
  ram: 'RAM',
  armazenamento: 'Armazenamento (SSD/HD)',
  smart: 'SMART',
  bateria: 'Bateria',
  temperatura: 'Temperatura e refrigeração',
};

async function executar(option) {
  // Aqui o Core (runner.js) vai assumir no futuro.
  console.log(`\n[${NOMES[option] ?? option}] (a implementar)`);
}

async function testeDestrutivo() {
  console.log('\n!!! TESTE DESTRUTIVO !!!');
  console.log('Este teste pode APAGAR DADOS do dispositivo selecionado.');
  console.log('[Teste destrutivo] (a implementar)');
  console.log('Requisitos: seleção explícita do disco + duas confirmações.');
}

// ---------- menus ----------

async function menuTestesIndividuais() {
  const { option } = await inquirer.prompt([
    {
      type: 'select',
      name: 'option',
      message: 'Testes individuais :',
      choices: [
        { name: NOMES.cpu, value: 'cpu' },
        { name: NOMES.ram, value: 'ram' },
        { name: NOMES.armazenamento, value: 'armazenamento' },
        { name: NOMES.smart, value: 'smart' },
        { name: NOMES.bateria, value: 'bateria' },
        { name: NOMES.temperatura, value: 'temperatura' },
        new inquirer.Separator(),
        { name: '← Voltar', value: 'voltar' },
      ],
    },
  ]);

  if (option === 'voltar') return false;
  await executar(option);
  return true;
}

async function menuPrincipal(hw) {
  while (true) {
    console.clear();
    mostrarCabecalho(hw);

    const { option } = await inquirer.prompt([
      {
        type: 'select',
        name: 'option',
        message: 'Selecione o modo de execução :',
        choices: [
          { name: NOMES.completo, value: 'completo' },
          { name: NOMES.rapido, value: 'rapido' },
          { name: NOMES.diagnostico, value: 'diagnostico' },
          { name: NOMES.stress, value: 'stress' },
          { name: NOMES.personalizado, value: 'personalizado' },
          { name: 'Testes individuais...', value: 'individuais' },
          new inquirer.Separator('──────── ZONA DE RISCO ────────'),
          { name: '⚠  Teste destrutivo (apaga dados)', value: 'destrutivo' },
          new inquirer.Separator(),
          { name: 'Sair', value: 'sair' },
        ],
      },
    ]);

    if (option === 'sair') {
      console.log('Até logo!');
      return;
    }

    if (option === 'individuais') {
      const executou = await menuTestesIndividuais();
      if (!executou) continue; // escolheu "Voltar"
    } else if (option === 'destrutivo') {
      await testeDestrutivo();
    } else {
      await executar(option);
    }

    const { voltar } = await inquirer.prompt([
      {
        type: 'select',
        name: 'voltar',
        message: ' ',
        choices: [
          { name: '← Voltar ao menu', value: 'menu' },
          { name: 'Sair', value: 'sair' },
        ],
      },
    ]);

    if (voltar === 'sair') {
      console.log('Até logo!');
      return;
    }
  }
}

// ---------- inicialização ----------

async function main() {
  console.log(`Iniciando ${PROJECT_NAME}...`);
  console.log('Detectando hardware...');
  const hw = await detectarHardware();
  await menuPrincipal(hw);
}

main().catch((err) => {
  // Ctrl+C dentro de um prompt lança este erro; tratamos como saída normal
  if (err.name === 'ExitPromptError') {
    console.log('\nAté logo!');
  } else {
    console.error(err);
    process.exitCode = 1;
  }
});