export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'A API de áudio ainda não está configurada.' });
  }

  try {
    const {
      genre,
      language,
      mood,
      energy,
      bpm,
      key,
      sections
    } = req.body || {};

    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ error: 'É necessário gerar primeiro a composição.' });
    }

    const safeBpm = Number(bpm) || 110;
    const safeEnergy = Number(energy) || 70;

    const chunks = sections.slice(0, 30).map((section, index) => {
      const words = String(section?.lyrics || '').trim().split(/\s+/).filter(Boolean).length;
      const baseSeconds = Math.max(8, Math.min(90, Math.round(words * 0.48)));
      const durationSeconds = index === 0 ? Math.max(10, baseSeconds) : baseSeconds;

      return {
        text: `[${section?.name || `Section ${index + 1}`}]\n${String(section?.lyrics || '').trim()}`,
        duration_ms: durationSeconds * 1000,
        positive_styles: [
          String(genre || 'Pop'),
          String(mood || 'Inspirador'),
          `${safeBpm} BPM`,
          `${String(key || 'Am')} tonalidade`,
          String(language || 'Português'),
          `${safeEnergy}% energy`,
          'professional modern production'
        ].filter(Boolean),
        negative_styles: ['spoken word', 'a cappella'],
        context_adherence: 0.85
      };
    });

    const response = await fetch('https://api.elevenlabs.io/v1/music', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        model_id: 'music_v2',
        composition_plan: { chunks },
        output_format: 'mp3_48000_192'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Eleven Music error:', response.status, errorText);

      if (response.status === 401) {
        return res.status(401).json({ error: 'A chave da API de áudio é inválida.' });
      }
      if (response.status === 402) {
        return res.status(402).json({ error: 'A conta ElevenLabs precisa de créditos ou de um plano compatível com a Music API.' });
      }
      if (response.status === 429) {
        return res.status(429).json({ error: 'O limite da API de áudio foi atingido. Tente novamente mais tarde.' });
      }

      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: 'O serviço de geração de áudio não conseguiu concluir o pedido.'
      });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline; filename="musicai-song.mp3"');
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).send(audio);
  } catch (error) {
    console.error('Audio generation error:', error);
    return res.status(500).json({ error: 'Erro interno ao gerar o áudio.' });
  }
}
