import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Extrai estritamente o conteúdo entre START_RESUMO e END_RESUMO
function extrairApenasResumo(texto) {
  if (!texto) return '';
  
  if (texto.includes('START_RESUMO')) {
    const trecho = texto.split('START_RESUMO')[1];
    if (trecho) {
      return trecho.split('END_RESUMO')[0].trim();
    }
  }

  // Fallback: se a IA não usou a tag, remove linhas típicas de rascunho/instrução
  return texto
    .split('\n')
    .filter(linha => {
      const l = linha.trim().toLowerCase();
      return !l.includes('bible study assistant') &&
             !l.includes('summarize') &&
             !l.includes('respond exclusively') &&
             !l.includes('no drafts') &&
             !l.includes('write directly') &&
             !l.includes('core subject') &&
             !l.startsWith('* role:') &&
             !l.startsWith('* task:');
    })
    .join('\n')
    .trim();
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('As variáveis de ambiente do Supabase não estão configuradas na Vercel.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Raspagem da página do JW.org
    const url = 'https://www.jw.org/pt/biblioteca/jw-apostila-do-mes/';
    const response = await fetch(url, { cache: 'no-store' });
    const html = await response.text();
    const $ = cheerio.load(html);

    const titulo = $('h1').first().text().trim() || 'Apostila de Estudo';
    const trechoTexto = $('article, .docSubContent, .synopsis').text().replace(/\s+/g, ' ').slice(0, 3000) || 'Conteúdo de estudo.';
    const semanaAtual = new Date().toISOString().slice(0, 10);

    // Prompt estrito exigindo os marcadores de delimitação
    const prompt = `Faça um resumo em português do Brasil, estruturado em tópicos, do texto a seguir.

REGRA OBRIGATÓRIA:
Sua resposta DEVE começar exatamente com a palavra "START_RESUMO" e terminar com a palavra "END_RESUMO".
Não inclua nada antes de START_RESUMO nem depois de END_RESUMO.

Texto:
${trechoTexto}`;

    let respostaBruta = '';
    let erroDetalhado = '';

    // Tentar via GROQ (Llama 3)
    if (groqKey) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2
          })
        });
        const groqData = await groqRes.json();
        if (groqData.choices?.[0]?.message?.content) {
          respostaBruta = groqData.choices[0].message.content;
        } else if (groqData.error) {
          erroDetalhado += `Groq: ${groqData.error.message} | `;
        }
      } catch (e) {
        erroDetalhado += `Groq falha: ${e.message} | `;
      }
    }

    // Tentar via Gemini
    if (!respostaBruta && geminiKey) {
      try {
        const resList = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
        const dataList = await resList.json();

        let modelosParaTestar = [];
        if (dataList.models && Array.isArray(dataList.models)) {
          modelosParaTestar = dataList.models
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => m.name.replace('models/', ''));
        }

        if (modelosParaTestar.length === 0) {
          modelosParaTestar = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
        }

        for (const mod of modelosParaTestar) {
          try {
            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${mod}:generateContent?key=${geminiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }]
                })
              }
            );
            const geminiData = await geminiRes.json();
            if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
              respostaBruta = geminiData.candidates[0].content.parts[0].text;
              break;
            } else if (geminiData.error) {
              erroDetalhado += `Gemini (${mod}): ${geminiData.error.message} | `;
            }
          } catch (e) {
            erroDetalhado += `Gemini (${mod}) falha: ${e.message} | `;
          }
        }
      } catch (e) {
        erroDetalhado += `Erro consultar Gemini: ${e.message} | `;
      }
    }

    // Isola estritamente o texto dentro das tags
    const resumoFinal = extrairApenasResumo(respostaBruta);

    const conteudoParaSalvar = resumoFinal || `Não foi possível extrair o resumo limpo. Erros: ${erroDetalhado}`;

    // 3. Gravar no Supabase
    const { error } = await supabase
      .from('estudos')
      .insert([
        {
          semana: semanaAtual,
          titulo: titulo,
          conteudo: { 
            resumoIa: conteudoParaSalvar,
            extraidoEm: new Date().toISOString() 
          }
        }
      ]);

    if (error) throw error;

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Estudo processado e filtrado com sucesso!',
      titulo,
      resumoIa: conteudoParaSalvar
    });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  }
}
