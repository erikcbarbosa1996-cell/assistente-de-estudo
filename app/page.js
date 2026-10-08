import { createClient } from '@supabase/supabase-js';

export const revalidate = 0; // Garante que a página sempre carrega os dados mais recentes

export default async function Home() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let estudos = [];

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase
      .from('estudos')
      .select('*')
      .order('created_at', { ascending: false });

    estudos = data || [];
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-12 text-slate-800">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            Assistente de Estudos
          </h1>
          <p className="mt-2 text-slate-600">
            Resumos automáticos e conteúdos de estudo semanal processados por IA
          </p>
        </header>

        {estudos.length === 0 ? (
          <div className="bg-white p-8 rounded-xl shadow-sm text-center text-slate-500 border border-slate-200">
            Nenhum estudo encontrado na base de dados.
          </div>
        ) : (
          <div className="space-y-6">
            {estudos.map((item) => (
              <article key={item.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition hover:shadow-md">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">
                    Data: {item.semana}
                  </span>
                  <time className="text-xs text-slate-400">
                    {new Date(item.created_at).toLocaleDateString('pt-PT')}
                  </time>
                </div>

                <h2 className="text-xl font-semibold text-slate-900 mb-4">
                  {item.titulo}
                </h2>

                <div className="bg-slate-50 p-4 rounded-lg text-sm leading-relaxed text-slate-700 whitespace-pre-line border border-slate-100">
                  {item.conteudo?.resumoIa || 'Sem resumo disponível.'}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
