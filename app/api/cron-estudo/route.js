import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Função para filtrar e remover rascunhos de pensamento da IA
function limparTextoIa(texto) {
  if (!texto) return '';
  
  return texto
    .split('\n')
    .filter(linha => {
      const l = linha.trim().toLowerCase();
      return !l.startsWith('* role:') &&
             !l.startsWith('* task:') &&
             !l.startsWith('* input text:') &&
             !l.startsWith('* subject:') &&
             !l.startsWith('* purpose:') &&
             !l.startsWith('* accessibility:') &&
             !l.startsWith('* available formats:') &&
             !l.startsWith('* timeframes:') &&
             !l.startsWith('* language:') &&
             !l.startsWith('bible study assistant') &&
             !l.startsWith('summarize the provided text') &&
             !l.includes('portuguese (brazil)?') &&
             !l.includes('no english/drafts?');
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

    const systemPrompt = "Você é um assistente de estudos bíblicos. Sua ÚNICA tarefa é fornecer o resumo final em português do Brasil formatado em tópicos simples e claros. JAMAIS escreva rascunhos, planos de resposta, notas de verificação ou qualquer palavra em inglês.";
    const userPrompt = `Faça o resumo em tópicos do seguinte texto:\n\n${trechoTexto}`;

    let respostaIa = '';
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
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.2
          })
        });
        const groqData = await groqRes.json();
        if (groqData.choices?.[0]?.message?.content) {
          respostaIa = groqData.choices[0].message.content;
        } else if (groqData.error) {
          erroDetalhado += `Groq erro: ${groqData.error.message} | `;
        }
      } catch (e) {
        erroDetalhado += `Groq falha: ${e.message} | `;
      }
    }

    // Tentar via Gemini com system_instruction nativa
    if (!respostaIa && geminiKey) {
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
                  system_instruction: {
                    parts: [{ text: systemPrompt }]
                  },
                  contents: [{ parts: [{ text: userPrompt }] }]
                })
              }
            );
            const geminiData = await geminiRes.json();
            if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
              respostaIa = geminiData.candidates[0].content.parts[0].text;
              break;
            } else if (geminiData.error) {
              erroDetalhado += `Gemini (${mod}): ${geminiData.error.message} | `;
            }
          } catch (e) {
            erroDetalhado += `Gemini (${mod}) falha: ${e.message} | `;
          }
        }
      } catch (e) {
        erroDetalhado += `Erro ao consultar modelos Gemini: ${e.message} | `;
      }
    }

    // Sanitiza a resposta removendo quaisquer rascunhos remanescentes
    respostaIa = limparTextoIa(respostaIa);

    if (!respostaIa) {
      respostaIa = `Não foi possível gerar a resposta pela IA. Detalhes: ${erroDetalhado || 'Verifique as chaves nas variáveis da Vercel.'}`;
    }

    // 3. Gravar no Supabase
    const { error } = await supabase
      .from('estudos')
      .insert([
        {
          semana: semanaAtual,
          titulo: titulo,
          conteudo: { 
            resumoIa: respostaIa,
            extraidoEm: new Date().toISOString() 
          }
        }
      ]);

    if (error) throw error;

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Estudo processado com sucesso!',
      titulo,
      resumoIa: respostaIa
    });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  }
}
