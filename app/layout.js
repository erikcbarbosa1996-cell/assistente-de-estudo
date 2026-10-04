export const metadata = {
  title: 'Assistente de Estudo',
  description: 'Gerador automático de respostas para o estudo da semana',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
