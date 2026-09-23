/**
 * TEST TOTAL - core/result.js
 *
 * Contrato de resultado do sistema. TODO módulo de teste (cpu, ram, storage,
 * smart, battery, temperature, stress...) deve devolver ao Core um objeto
 * criado por `criarResultado()` (ou pelos atalhos abaixo).
 *
 * Estados (Documento de Definição, seção 5):
 *   PASS            → teste executado e aprovado
 *   WARNING         → condição de atenção detectada
 *   FAIL            → falha confirmada
 *   NOT TESTED      → teste não executado
 *   NOT APPLICABLE  → teste não aplicável ao equipamento
 *
 * Este arquivo apenas define e valida o formato. A regra APTO / NÃO APTO
 * fica em core/decision.js.
 */

// ---------- estados ----------

export const STATUS = Object.freeze({
  PASS: 'PASS',
  WARNING: 'WARNING',
  FAIL: 'FAIL',
  NOT_TESTED: 'NOT TESTED',
  NOT_APPLICABLE: 'NOT APPLICABLE',
});

const STATUS_VALIDOS = new Set(Object.values(STATUS));

export function statusValido(status) {
  return STATUS_VALIDOS.has(status);
}

// ---------- validações internas ----------

function numeroOuNull(valor, campo) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'number' || Number.isNaN(valor)) {
    throw new TypeError(`Resultado inválido: "${campo}" deve ser número ou null.`);
  }
  return valor;
}

function normalizarTemperatura(temp) {
  if (temp === null || temp === undefined) return null;
  if (typeof temp !== 'object') {
    throw new TypeError('Resultado inválido: "temperatura" deve ser um objeto ou null.');
  }
  // Seção 12: temperatura inicial, pico e recuperação (°C)
  return {
    inicial: numeroOuNull(temp.inicial, 'temperatura.inicial'),
    maxima: numeroOuNull(temp.maxima, 'temperatura.maxima'),
    final: numeroOuNull(temp.final, 'temperatura.final'),
  };
}

function normalizarErro(erro) {
  if (erro === null || erro === undefined) return null;
  if (erro instanceof Error) return erro.message;
  return String(erro);
}

// ---------- criação de resultado ----------

/**
 * Cria um resultado padronizado.
 *
 * @param {object}  dados
 * @param {string}  dados.teste            Nome do teste. Ex.: "CPU Stress 30min" (obrigatório)
 * @param {string}  dados.status           Um dos valores de STATUS (obrigatório)
 * @param {string}  [dados.modulo]         Módulo de origem. Ex.: "cpu", "smart"
 * @param {string}  [dados.mensagem]       Explicação legível do resultado
 * @param {string}  [dados.causaProvavel]  Causa provável (seção 14). Ex.: "possível degradação do SSD"
 * @param {string|Error} [dados.erro]      Erro técnico, se houver
 * @param {object}  [dados.temperatura]    { inicial, maxima, final } em °C
 * @param {number}  [dados.duracaoMs]      Duração do teste em milissegundos
 * @param {string}  [dados.ferramenta]     Ferramenta usada. Ex.: "stress-ng", "smartctl"
 * @param {object}  [dados.metricas]       Valores medidos (ex.: { leituraSequencialMBs: 512 })
 * @param {object}  [dados.dadosBrutos]    Dados originais preservados (ex.: SMART bruto, seção 10)
 * @param {string}  [dados.inicio]         ISO 8601 do início
 * @param {string}  [dados.fim]            ISO 8601 do fim
 * @returns {Readonly<object>} resultado padronizado (imutável no primeiro nível)
 */
export function criarResultado(dados = {}) {
  const {
    teste,
    status,
    modulo = null,
    mensagem = '',
    causaProvavel = null,
    erro = null,
    temperatura = null,
    duracaoMs = null,
    ferramenta = null,
    metricas = {},
    dadosBrutos = null,
    inicio = null,
    fim = null,
  } = dados;

  if (typeof teste !== 'string' || teste.trim() === '') {
    throw new TypeError('Resultado inválido: "teste" é obrigatório.');
  }
  if (!statusValido(status)) {
    throw new TypeError(
      `Resultado inválido (${teste}): status "${status}" não existe. ` +
        `Use: ${[...STATUS_VALIDOS].join(', ')}.`
    );
  }

  const duracao = numeroOuNull(duracaoMs, 'duracaoMs');
  if (duracao !== null && duracao < 0) {
    throw new RangeError('Resultado inválido: "duracaoMs" não pode ser negativo.');
  }

  return Object.freeze({
    teste: teste.trim(),
    modulo,
    status,
    mensagem,
    causaProvavel,
    erro: normalizarErro(erro),
    temperatura: normalizarTemperatura(temperatura),
    duracaoMs: duracao,
    ferramenta,
    metricas,
    dadosBrutos,
    inicio,
    fim,
    registradoEm: new Date().toISOString(),
  });
}

// ---------- atalhos ----------
// Uso: aprovar('Leitura sequencial', 'Média de 520 MB/s', { modulo: 'storage' })

export const aprovar = (teste, mensagem = '', extras = {}) =>
  criarResultado({ ...extras, teste, mensagem, status: STATUS.PASS });

export const alertar = (teste, mensagem = '', extras = {}) =>
  criarResultado({ ...extras, teste, mensagem, status: STATUS.WARNING });

export const falhar = (teste, mensagem = '', extras = {}) =>
  criarResultado({ ...extras, teste, mensagem, status: STATUS.FAIL });

export const naoTestado = (teste, mensagem = '', extras = {}) =>
  criarResultado({ ...extras, teste, mensagem, status: STATUS.NOT_TESTED });

export const naoAplicavel = (teste, mensagem = '', extras = {}) =>
  criarResultado({ ...extras, teste, mensagem, status: STATUS.NOT_APPLICABLE });
