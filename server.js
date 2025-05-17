
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Simple HTTP Basic Auth middleware
const basicAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  const expected = 'Basic ' + Buffer.from('admin:opsotools').toString('base64');

  if (auth === expected) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Opsotools"');
  res.status(401).send('Authentication required.');
};

// Apply auth middleware to all routes
app.use(basicAuth);

// Serve static content after auth
app.use(express.static('public'));

app.get('/generate', (req, res) => {
  const ga4 = req.query.ga4;
  const ads = req.query.ads;
  const labelDownload = req.query.labelDownload;
  const labelLPView = req.query.labelLPView;
  const labelTYP = req.query.labelTYP;
  const templateFile = "Firefox-Google-Container.json";

  const filePath = path.join(__dirname, 'template', templateFile);
  let template;

  try {
    template = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`📄 Loaded template: ${templateFile}`);
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
        : [],
      tag: Array.isArray(template.containerVersion.tag)
        ? template.containerVersion.tag.map(t => {
            if (t.name.includes("Click on Download") && t.type === "awct" && labelDownload) {
              t.parameter.forEach(p => {
                if (p.key === "conversionLabel") p.value = labelDownload;
              });
            }
            if (t.name.includes("LP View") && t.type === "awct" && labelLPView) {
              t.parameter.forEach(p => {
                if (p.key === "conversionLabel") p.value = labelLPView;
              });
            }
            if (t.name.includes("TYP") && t.type === "awct" && labelTYP) {
              t.parameter.forEach(p => {
                if (p.key === "conversionLabel") p.value = labelTYP;
              });
            }
            return t;
          })
        : []
    }
  };

  const outputDir = path.join('/tmp', 'exported_containers');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
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
