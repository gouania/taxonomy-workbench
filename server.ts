import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import {
  serverAnalyzeSingleTaxon,
  serverCompareTaxa,
  serverIdentifySpecimen,
  serverSuggestNextCharacters,
  serverExplainCharacter,
  serverLookupAuthority,
  serverGenerateLocalityProfile,
  serverGenerateQuizDistractors,
  serverEvaluateQuizAnswer,
  serverGenerateTaxonGuide,
  serverGenerateStructuredTaxonGuide,
} from './server/gemini';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Router
  app.post('/api/gemini', async (req, res) => {
    const { action, payload } = req.body;
    try {
      switch (action) {
        case 'analyzeSingleTaxon': {
          const { name, locality, useWebSearch } = payload;
          const data = await serverAnalyzeSingleTaxon(name, locality, useWebSearch);
          return res.json(data);
        }
        case 'compareTaxa': {
          const { names, locality, useWebSearch } = payload;
          const data = await serverCompareTaxa(names, locality, useWebSearch);
          return res.json(data);
        }
        case 'identifySpecimen': {
          const { characters, notes, location, suspectedFamilies, useWebSearch } = payload;
          const data = await serverIdentifySpecimen(characters, notes, location, suspectedFamilies, useWebSearch);
          return res.json(data);
        }
        case 'suggestNextCharacters': {
          const { selectedCharacters, availableCharacters } = payload;
          const data = await serverSuggestNextCharacters(selectedCharacters, availableCharacters);
          return res.json(data);
        }
        case 'explainCharacter': {
          const { characterLabel } = payload;
          const data = await serverExplainCharacter(characterLabel);
          return res.json({ result: data });
        }
        case 'lookupAuthority': {
          const { query, useWebSearch } = payload;
          const data = await serverLookupAuthority(query, useWebSearch);
          return res.json(data);
        }
        case 'generateLocalityProfile': {
          const { locationInput } = payload;
          const data = await serverGenerateLocalityProfile(locationInput);
          return res.json(data);
        }
        case 'generateQuizDistractors': {
          const { correctTaxon } = payload;
          const data = await serverGenerateQuizDistractors(correctTaxon);
          return res.json({ result: data });
        }
        case 'evaluateQuizAnswer': {
          const { correctTaxon, guessedTaxon } = payload;
          const data = await serverEvaluateQuizAnswer(correctTaxon, guessedTaxon);
          return res.json({ result: data });
        }
        case 'generateTaxonGuide': {
          const { inputText } = payload;
          const data = await serverGenerateTaxonGuide(inputText);
          return res.json({ result: data });
        }
        case 'generateStructuredTaxonGuide': {
          const { taxon, locality, useSearch, filters } = payload;
          const data = await serverGenerateStructuredTaxonGuide(taxon, locality, useSearch, filters);
          return res.json(data);
        }
        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }
    } catch (error: any) {
      console.error(`Error in /api/gemini (${action}):`, error);
      return res.status(500).json({ error: error.message || 'Server error processing request' });
    }
  });

  // Vite middleware for dev / static serving for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
