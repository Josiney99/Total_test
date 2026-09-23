/**
 * TEST TOTAL - core/decision.js
 *
 * Recebe a lista de resultados (criados por core/result.js) e devolve a
 * conclusão final: APTO ou NÃO APTO, com os motivos.
 *
 * Regras (Documento de Definição, seção 5):
 *   - Qualquer WARNING ou FAIL  → NÃO APTO
 *   - PASS                      → não impede APTO
 *   - NOT TESTED                → não impede APTO
 *   - NOT APPLICABLE            → não impede APTO
 *
 * O relatório deve deixar explícito quais testes foram realmente executados,
 * para que APTO não seja interpretado como "todos os componentes foram
 * testados". Por isso a decisão devolve também a cobertura e avisos.
 *
 * Não existe índice de estabilidade nem nota numérica.
 */

import { STATUS, statusValido } from './result.js';

export const VEREDITO = Object.freeze({
  APTO: 'APTO',
  NAO_APTO: 'NÃO APTO',
});

// Estados que tornam o equipamento NÃO APTO
const BLOQUEIAM_APTIDAO = new Set([STATUS.WARNING, STATUS.FAIL]);

// ---------- decisão ----------

/**
 * @param {Array<object>} resultados  Lista de resultados padronizados
 * @returns {object} {
 *   veredito:  'APTO' | 'NÃO APTO',
 *   motivos:   [{ teste, modulo, status, mensagem, causaProvavel, erro }],
 *   resumo:    { PASS, WARNING, FAIL, 'NOT TESTED', 'NOT APPLICABLE' },
 *   cobertura: { total, executados, naoTestados, naoAplicaveis },
 *   avisos:    string[]
 * }
 */
export function decidir(resultados) {
  if (!Array.isArray(resultados)) {
    throw new TypeError('decidir() espera uma lista de resultados.');
  }

  // Valida tudo antes de decidir: um status inválido nunca pode passar batido.
  resultados.forEach((r, i) => {
    if (!r || typeof r !== 'object' || !statusValido(r.status)) {
      throw new TypeError(
        `Resultado #${i} inválido: status "${r?.status}" não reconhecido.`
      );
    }
  });

  // Contagem por estado
  const resumo = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
  for (const r of resultados) resumo[r.status] += 1;

  // Motivos = tudo que bloqueia (FAIL primeiro, depois WARNING)
  const ordem = { [STATUS.FAIL]: 0, [STATUS.WARNING]: 1 };
  const motivos = resultados
    .filter((r) => BLOQUEIAM_APTIDAO.has(r.status))
    .sort((a, b) => ordem[a.status] - ordem[b.status])
    .map((r) => ({
      teste: r.teste,
      modulo: r.modulo ?? null,
      status: r.status,
      mensagem: r.mensagem ?? '',
      causaProvavel: r.causaProvavel ?? null,
      erro: r.erro ?? null,
    }));

  const naoTestados = resultados
    .filter((r) => r.status === STATUS.NOT_TESTED)
    .map((r) => r.teste);
  const naoAplicaveis = resultados
    .filter((r) => r.status === STATUS.NOT_APPLICABLE)
    .map((r) => r.teste);

  const executados =
    resumo[STATUS.PASS] + resumo[STATUS.WARNING] + resumo[STATUS.FAIL];

  // Avisos de cobertura (evitam interpretar APTO como "tudo foi testado")
  const avisos = [];
  if (resultados.length === 0 || executados === 0) {
    avisos.push(
      'Nenhum teste foi executado. O resultado APTO não representa avaliação do hardware.'
    );
  } else if (naoTestados.length > 0) {
    avisos.push(
      `APTO refere-se somente aos ${executados} teste(s) executado(s). ` +
        `Não testados: ${naoTestados.join(', ')}.`
    );
  }

  const veredito = motivos.length > 0 ? VEREDITO.NAO_APTO : VEREDITO.APTO;

  return {
    veredito,
    motivos,
    resumo,
    cobertura: {
      total: resultados.length,
      executados,
      naoTestados,
      naoAplicaveis,
    },
    avisos,
  };
}

// ---------- texto da conclusão ----------

/**
 * Gera as linhas de texto da conclusão (console e relatório).
 * Ex.: "SSD FAIL — setores pendentes detectados — possível degradação do dispositivo"
 */
export function formatarConclusao(decisao) {
  const linhas = [];
  linhas.push(`RESULTADO FINAL: ${decisao.veredito}`);

  if (decisao.motivos.length > 0) {
    linhas.push('');
    linhas.push('Motivos:');
    for (const m of decisao.motivos) {
      let linha = `  - ${m.teste} ${m.status}`;
      if (m.mensagem) linha += ` — ${m.mensagem}`;
      if (m.causaProvavel) linha += ` — ${m.causaProvavel}`;
      linhas.push(linha);
    }
  }

  const { cobertura } = decisao;
  linhas.push('');
  linhas.push(
    `Testes: ${cobertura.total} no total | ${cobertura.executados} executado(s) | ` +
      `${cobertura.naoTestados.length} não testado(s) | ` +
      `${cobertura.naoAplicaveis.length} não aplicável(is)`
  );

  for (const aviso of decisao.avisos) {
    linhas.push(`Atenção: ${aviso}`);
  }

  return linhas.join('\n');
}
