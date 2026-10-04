import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET() {
  try {
    const urlReuniao = 'https://wol.jw.org/pt/wol/meetings/r5/lp-t/2026/40';
    
    const response = await fetch(urlReuniao);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Extrai o título do estudo
    const tituloSemana = $('h1').text().trim() || 'Estudo da Semana';

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Scraping executado com sucesso!',
      titulo: tituloSemana,
      dataExecucao: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error.message },
      { status: 500 }
    );
  }
}
