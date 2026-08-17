const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    key: { type: "string" },
    bpm: { type: "integer", minimum: 60, maximum: 180 },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          lyrics: { type: "string" },
          chords: { type: "string" }
        },
        required: ["name", "lyrics", "chords"]
      }
    }
  },
  required: ["title", "key", "bpm", "sections"]
};

function parseJsonContent(content) {
  if (!content || typeof content !== "string") return null;
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function validateSong(song) {
  if (!song || typeof song !== "object") return false;
  if (typeof song.title !== "string" || typeof song.key !== "string") return false;
  if (!Number.isInteger(song.bpm) || song.bpm < 60 || song.bpm > 180) return false;
  if (!Array.isArray(song.sections) || song.sections.length === 0) return false;
  return song.sections.every(
    (section) =>
      section &&
      typeof section.name === "string" &&
      typeof section.lyrics === "string" &&
      typeof section.chords === "string"
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({
      error: "A IA ainda não está configurada. Adicione OPENROUTER_API_KEY nas variáveis de ambiente do deploy."
    });
  }

  try {
    const { genre, language, mood, idea, energy } = req.body || {};

    if (!genre || !language || !mood || !idea) {
      return res.status(400).json({ error: "Preencha estilo, idioma, clima e tema/ideia." });
    }

    const prompt = `Cria uma música ORIGINAL para o MusicAI Studio.
Estilo: ${genre}
Idioma: ${language}
Clima: ${mood}
Energia: ${energy}%
Tema/ideia: ${idea}

Responde EXCLUSIVAMENTE com um único objeto JSON válido, sem markdown, sem comentários e sem texto antes ou depois.
O JSON deve ter exatamente esta estrutura:
${JSON.stringify(schema)}

Regras:
- Escreve uma letra totalmente original; não imites nem reproduzas letras de artistas existentes.
- Estrutura a música com [Verso 1], [Pré-Refrão] (se fizer sentido), [Refrão], [Verso 2], [Ponte] e [Outro] quando apropriado.
- Cria cifras/acordes coerentes com a tonalidade e com o género.
- Os acordes devem ser apresentados por secção, por exemplo: Am | F | C | G.
- Escolhe BPM adequado ao género e à energia.
- Mantém a letra natural e cantável no idioma pedido.
- O campo bpm deve ser um número inteiro entre 60 e 180.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://cuddly-journey-k2b7gff3i-acm-c82e.vercel.app/",
        "X-Title": "MusicAI Studio"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenRouter error", data);
      return res.status(response.status).json({ error: "Não foi possível gerar a música agora." });
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error("OpenRouter empty response", data);
      return res.status(502).json({ error: "A IA não devolveu conteúdo." });
    }

    const song = parseJsonContent(content);
    if (!validateSong(song)) {
      console.error("Invalid song JSON from OpenRouter", content);
      return res.status(502).json({ error: "A IA devolveu um formato de música inválido." });
    }

    return res.status(200).json(song);
  } catch (error) {
    console.error("Generation error", error);
    return res.status(500).json({ error: "Erro interno ao gerar a música." });
  }
}
