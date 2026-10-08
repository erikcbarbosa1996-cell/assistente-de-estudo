import { createClient } from '@supabase/supabase-js';

export const revalidate = 0;

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
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '40px 20px',
      color: '#1e293b'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        
        {/* Cabeçalho */}
        <header style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
            📖 Assistente de Estudos
          </h1>
          <p style={{ color: '#64748b', fontSize: '16px' }}>
            Resumos automáticos e tópicos de estudo gerados por Inteligência Artificial
          </p>
        </header>

        {/* Lista de Estudos */}
        {estudos.length === 0 ? (
          <div style={{
            backgroundColor: '#ffffff',
            padding: '30px',
            borderRadius: '12px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            Nenhum estudo cadastrado no momento.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {estudos.map((item) => {
              const dataFormatada = new Date(item.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              });

              return (
                <article key={item.id} style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  padding: '24px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                }}>
                  <div style={{
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    borderBottom: '1px solid #f1f5f9',
                    paddingBottom: '12px'
                  }}>
                    <span style={{
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: '600'
                    }}>
                      Estudo Semanal
                    </span>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                      {dataFormatada}
                    </span>
                  </div>

                  <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '16px' }}>
                    {item.titulo}
                  </h2>

                  <div style={{
                    backgroundColor: '#f8fafc',
                    padding: '20px',
                    borderRadius: '8px',
                    lineHeight: '1.7',
                    fontSize: '15px',
                    color: '#334155',
                    whiteSpace: 'pre-line',
                    borderLeft: '4px solid #2563eb'
                  }}>
                    {item.conteudo?.resumoIa || 'Sem resumo disponível.'}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
