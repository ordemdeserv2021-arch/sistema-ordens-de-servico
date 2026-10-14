export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'Método não permitido' });
  }

  return res.status(503).json({
    message: 'A sincronização com o Neon será habilitada após a validação da sessão no servidor.'
  });
}
