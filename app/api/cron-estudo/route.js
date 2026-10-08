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

    // Prompt estrito para resposta estritamente em JSON
    const prompt = `Resuma o texto a seguir em tópicos organizados em português do Brasil.
Você DEVE responder EXCLUSIVAMENTE em formato JSON com a chave "resumo".

Exemplo do formato esperado:
{
  "resumo": "• Ponto principal 1\\n• Ponto principal 2\\n• Ponto principal 3"
}

Texto:
${trechoTexto}`;

    let respostaIa = '';
    let erroDetalhado = '';

    // Tentar via GROQ (Llama 3 com resposta JSON nativa)
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
            response_format: { type: 'json_object' },
            temperature: 0.1
          })
        });
        const groqData = await groqRes.json();
        const rawJson = groqData.choices?.[0]?.message?.content;
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          respostaIa = parsed.resumo || parsed.summary || rawJson;
        } else if (groqData.error) {
          erroDetalhado += `Groq: ${groqData.error.message} | `;
        }
      } catch (e) {
        erroDetalhado += `Groq falha: ${e.message} | `;
      }
    }

    // Tentar via Gemini (com response_mime_type JSON)
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
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { response_mime_type: 'application/json' }
                })
              }
            );
            const geminiData = await geminiRes.json();
            const rawJson = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawJson) {
              const parsed = JSON.parse(rawJson);
              respostaIa = parsed.resumo || parsed.summary || rawJson;
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

    if (!respostaIa) {
      respostaIa = `Não foi possível gerar o resumo. Erros: ${erroDetalhado}`;
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
      mensagem: 'Estudo processado em JSON e gravado com sucesso!',
      titulo,
      resumoIa: respostaIa
    });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  }
}
