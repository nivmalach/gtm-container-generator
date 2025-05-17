
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Basic Auth middleware
const basicAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  const expected = 'Basic ' + Buffer.from('admin:opsotools').toString('base64');
  if (auth === expected) return next();

  res.setHeader('WWW-Authenticate', 'Basic realm="Opsotools"');
  res.status(401).send('Authentication required.');
};

app.use(basicAuth);
app.use(express.static('public'));

app.get('/generate', (req, res) => {
  const { template, ga4, ads, labelDownload, labelLPView, labelTYP } = req.query;

  if (!template) {
    return res.status(400).send('Missing template selection');
  }

  const templatePath = path.join(__dirname, 'template', template);

  if (!fs.existsSync(templatePath)) {
    return res.status(404).send('Selected template not found');
  }

  let templateData;
  try {
    templateData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    console.log(`📄 Loaded template: ${template}`);
  } catch (err) {
    console.error(`❌ Failed to parse template "${template}":`, err.message);
    return res.status(500).send('Template loading error');
  }

  const newContainer = {
    ...templateData,
    containerVersion: {
      ...templateData.containerVersion,
      variable: Array.isArray(templateData.containerVersion.variable)
        ? templateData.containerVersion.variable.map(v => {
            if (v.name === 'GA4 ID') v.parameter[0].value = ga4;
            if (v.name === 'Google Ads Conversion ID') v.parameter[0].value = ads;
            return v;
          })
        : [],
      tag: Array.isArray(templateData.containerVersion.tag)
        ? templateData.containerVersion.tag.map(t => {
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
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const outputFilename = `${template.replace('.json', '')}_${timestamp}.json`;
  const outputPath = path.join(outputDir, outputFilename);

  fs.writeFileSync(outputPath, JSON.stringify(newContainer, null, 2));
  res.download(outputPath, 'modified-gtm-container.json');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
