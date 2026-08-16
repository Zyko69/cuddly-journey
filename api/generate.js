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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "A IA ainda não está configurada. Adicione OPENAI_API_KEY nas variáveis de ambiente do deploy."
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

Regras:
- Escreve uma letra totalmente original; não imites nem reproduzas letras de artistas existentes.
- Estrutura a música com [Verso 1], [Pré-Refrão] (se fizer sentido), [Refrão], [Verso 2], [Ponte] e [Outro] quando apropriado.
- Cria cifras/acordes coerentes com a tonalidade e com o género.
- Os acordes devem ser apresentados por secção, por exemplo: Am | F | C | G.
- Escolhe BPM adequado ao género e à energia.
- Mantém a letra natural e cantável no idioma pedido.
- Devolve apenas os dados no formato estruturado solicitado.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6",
        input: prompt,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "music_song",
            strict: true,
            schema
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI error", data);
      return res.status(response.status).json({ error: "Não foi possível gerar a música agora." });
    }

    const text = data.output_text;
    if (!text) {
      return res.status(502).json({ error: "A IA não devolveu conteúdo." });
    }

    return res.status(200).json(JSON.parse(text));
  } catch (error) {
    console.error("Generation error", error);
    return res.status(500).json({ error: "Erro interno ao gerar a música." });
  }
}
