import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('As variáveis de ambiente do Supabase não estão configuradas na Vercel.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Raspagem da página de Apostilas no JW.org
    const url = 'https://www.jw.org/pt/biblioteca/jw-apostila-do-mes/';
    const response = await fetch(url, { cache: 'no-store' });
    const html = await response.text();
    const $ = cheerio.load(html);

    // Extrai o título e texto
    const titulo = $('h1').first().text().trim() || 'Apostila de Estudo';
    const trechoTexto = $('article, .docSubContent, .synopsis').text().slice(0, 3000) || 'Conteúdo de estudo da semana.';
    const semanaAtual = new Date().toISOString().slice(0, 10);

    // 2. Processar com o Gemini
    let respostaIa = 'Chave do Gemini não configurada.';

    if (geminiKey) {
      const prompt = `Você é um assistente de estudos bíblicos. Faça um resumo conciso e com pontos principais para estudo deste texto: ${trechoTexto}`;

      // Monta lista de candidatos a testar
      let modelosParaTestar = [];
      
      try {
        const resList = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
        const dataList = await resList.json();
        if (dataList.models && Array.isArray(dataList.models)) {
          modelosParaTestar = dataList.models
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => m.name.replace('models/', ''));
        }
      } catch (e) {
        console.error('Erro ao listar modelos:', e);
      }

      // Garante modelos padrão de reserva na lista
      const reservas = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      for (const res of reservas) {
        if (!modelosParaTestar.includes(res)) {
          modelosParaTestar.push(res);
        }
      }

      let ultimoErro = '';
      let sucessoIa = false;

      // Testa cada modelo da lista até obter resposta VÁLIDA da IA
      for (const modelo of modelosParaTestar) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${geminiKey}`,
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
            sucessoIa = true;
            break; // Encontrou um modelo funcional, sai do loop!
          } else if (geminiData.error) {
            ultimoErro = geminiData.error.message;
          }
        } catch (err) {
          ultimoErro = err.message;
        }
      }

      if (!sucessoIa) {
        throw new Error(`Erro Gemini: ${ultimoErro || 'Nenhum modelo respondeu com sucesso.'}`);
      }
    }

    // 3. Gravar no Supabase
    const { data, error } = await supabase
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

    if (error) {
      throw error;
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Estudo raspado, processado pelo Gemini e guardado no Supabase com sucesso!',
      titulo,
      resumoIa: respostaIa
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error.message },
      { status: 500 }
    );
  }
}
