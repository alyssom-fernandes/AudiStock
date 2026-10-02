// ================================================================
//  AudiStock — js/consulta.js
//  O Supabase devolve no máximo 1.000 linhas por consulta (max-rows).
//  buscarTodos() pede em páginas até acabar, para uma auditoria grande
//  não perder itens em silêncio.
// ================================================================

export async function buscarTodos(montar, tamanho = 1000) {
  const todos = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montar().range(de, de + tamanho - 1);
    if (error) throw new Error(error.message);
    todos.push(...data);
    if (data.length < tamanho) return todos;
  }
}
