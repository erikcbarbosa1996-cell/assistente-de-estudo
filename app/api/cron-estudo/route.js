import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Variáveis de ambiente do Supabase não estão configuradas na Vercel.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Raspagem do conteúdo no JW.org
    const url = 'https://www.jw.org/pt/biblioteca/jw-apostila-do-mes/';
    const response = await fetch(url, { cache: 'no-store' });
    const html = await response.text();
    const $ = cheerio.load(html);

    const titulo = $('h1').first().text().trim() || 'Apostila de Estudo';
    const trechoTexto = $('article, .docSubContent, .synopsis').text().replace(/\s+/g, ' ').slice(0, 3000) || 'Conteúdo de estudo.';
    const semanaAtual = new Date().toISOString().slice(0, 10);

    // 2. Geração estruturada com Vercel AI SDK
    const { object } = await generateObject({
      model: google('gemini-1.5-flash'),
      schema: z.object({
        resumo: z.string().describe('Resumo estruturado em tópicos concisos, exclusivamente em português do Brasil.')
      }),
      prompt: `Faça um resumo de estudo em tópicos do seguinte texto:\n\n${trechoTexto}`
    });

    const respostaIa = object.resumo;

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
      mensagem: 'Estudo gerado com Vercel AI SDK e salvo no Supabase com sucesso!',
      titulo,
      resumoIa: respostaIa
    });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  }
}
