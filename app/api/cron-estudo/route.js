import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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

    // 2. Prompt estrito para a IA
    const prompt = `Você é um assistente de estudos bíblicos.
INSTRUÇÕES:
- Responda EXCLUSIVAMENTE em português do Brasil.
- NÃO inclua rascunhos, análises do prompt ou pensamentos em inglês.
- Escreva diretamente o resumo formatado com tópicos e pontos principais para estudo.

Texto para resumir:
${trechoTexto}`;

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
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
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

    // Se Groq não gerou e temos chave do Gemini, tentar Gemini
    if (!respostaIa && geminiKey) {
      const modelosGemini = ['gemini-1.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro'];
      
      for (const mod of modelosGemini) {
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
            respostaIa = geminiData.candidates[0].content.parts[0].text;
            break;
          } else if (geminiData.error) {
            erroDetalhado += `Gemini (${mod}): ${geminiData.error.message} | `;
          }
        } catch (e) {
          erroDetalhado += `Gemini (${mod}) falha: ${e.message} | `;
        }
      }
    }

    if (!respostaIa) {
      respostaIa = `Não foi possível gerar a resposta pela IA. Detalhes: ${erroDetalhado || 'Verifique se GROQ_API_KEY ou GEMINI_API_KEY estão cadastradas nas Environment Variables da Vercel.'}`;
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
