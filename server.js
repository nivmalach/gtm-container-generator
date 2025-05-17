const express = require('express');
const fs = require('fs');
const path = require('path');

console.log("👀 Server file is being loaded");

const app = express();
const PORT = 3000;

app.use(express.static('public'));

// NEW: Dynamic template list route
app.get('/templates', (req, res) => {
  const templateDir = path.join(__dirname, 'template');
  fs.readdir(templateDir, (err, files) => {
    if (err) return res.status(500).send('❌ Failed to read template directory.');
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    res.json(jsonFiles);
  });
});

app.get('/generate', (req, res) => {
  const ga4 = req.query.ga4;
  const ads = req.query.ads;
  const templateFile = req.query.template;

  if (!templateFile) {
    return res.status(400).send('❌ Missing template selection');
  }

  const filePath = path.join(__dirname, 'template', templateFile);
  let template;

  try {
    template = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`📄 Loaded template: ${templateFile}`);
    console.log("Loaded template keys:", Object.keys(template));
  } catch (err) {
    console.error(`❌ Failed to load template "${templateFile}":`, err.message);
    return res.status(400).send('❌ Invalid template file');
  }

  const newContainer = {
    ...template,
    containerVersion: {
      ...template.containerVersion,
      variable: Array.isArray(template.containerVersion.variable)
        ? template.containerVersion.variable.map(v => {
            if (v.name === 'GA4 ID') v.parameter[0].value = ga4;
            if (v.name === 'Google Ads Conversion ID') v.parameter[0].value = ads;
            return v;
          })
        : []
    }
  };

  // Ensure output directory exists
  const outputDir = path.join(__dirname, 'exported_containers');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const outputFilename = `${templateFile.replace('.json', '')}_${timestamp}.json`;
  const outputPath = path.join(outputDir, outputFilename);

  fs.writeFileSync(outputPath, JSON.stringify(newContainer, null, 2));
  res.download(outputPath, 'modified-gtm-container.json');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});