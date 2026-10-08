import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// Força a rota a ser executada em tempo de requisição (sem pré-renderização estática)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('As variáveis de ambiente do Supabase não estão configuradas na Vercel.');
    }

    // Inicializa o cliente do Supabase dentro do handler
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Raspagem do conteúdo no JW.org
    const url = 'https://www.jw.org/pt/biblioteca/jw-apostilas-estudo/';
    const response = await fetch(url, { cache: 'no-store' });
    const html = await response.text();
    const $ = cheerio.load(html);

    // Extrai o título principal
    const titulo = $('h1').first().text().trim() || 'Estudo da Semana';
    const semanaAtual = new Date().toISOString().slice(0, 10);

    // 2. Gravar os dados no Supabase
    const { data, error } = await supabase
      .from('estudos')
      .insert([
        {
          semana: semanaAtual,
          titulo: titulo,
          conteudo: { extraidoEm: new Date().toISOString() }
        }
      ]);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Dados extraídos e guardados no Supabase com sucesso!',
      titulo
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error.message },
      { status: 500 }
    );
  }
}
