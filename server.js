const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

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
  const {
    template, ga4, ads,
    labelDownload, labelLPView, labelTYP,
    triggerGAHost, triggerHomeExclude, triggerLandingPath,
    triggerTYPUrl, triggerClickMain, triggerClickHeader,
    triggerClickHeaderWin, triggerClickFooterWin, triggerClickFooter,
    triggerClickIndicator, triggerHomePage, triggerLanding,
    triggerPronto, triggerClickMainAlt, triggerTYP
  } = req.query;

  const unwrap = val => val?.replace(/[{}]/g, '').trim();

  if (!template) return res.status(400).send('Missing template selection');
  const templatePath = path.join(__dirname, 'template', template);
  if (!fs.existsSync(templatePath)) return res.status(404).send('Selected template not found');

  let templateData;
  try {
    templateData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    console.log(`📄 Loaded template: ${template}`);
  } catch (err) {
    return res.status(500).send('Template load failed: ' + err.message);
  }

  const newContainer = {
    ...templateData,
    containerVersion: {
      ...templateData.containerVersion,
      variable: (templateData.containerVersion.variable || []).map(v => {
        if (v.name === 'GA4 ID') v.parameter[0].value = ga4;
        if (v.name === 'Google Ads Conversion ID') v.parameter[0].value = ads;
        return v;
      }),
      tag: (templateData.containerVersion.tag || []).map(t => {
        if (t.name.includes("Click on Download") && labelDownload && t.parameter) {
          t.parameter.forEach(p => { if (p.key === "conversionLabel") p.value = labelDownload; });
        }
        if (t.name.includes("LP View") && labelLPView && t.parameter) {
          t.parameter.forEach(p => { if (p.key === "conversionLabel") p.value = labelLPView; });
        }
        if (t.name.includes("TYP") && labelTYP && t.parameter) {
          t.parameter.forEach(p => { if (p.key === "conversionLabel") p.value = labelTYP; });
        }
        return t;
      }),
    }
  };

  // Generic helper to update any filter’s arg1 based on arg0 match
  const updateFilterParams = (filters = [], newVal) => {
    return filters.map(f => {
      if (f.parameter) {
        const arg0 = f.parameter.find(p => p.key === 'arg0');
        const arg1 = f.parameter.find(p => p.key === 'arg1');
        if (arg0 && arg1 && newVal !== undefined) {
          arg1.value = newVal;
          console.log(`→ Updated ${tr.name} ${arg0.value.replace(/{{|}}/g,'')} →`, newVal);
        }
      }
      return f;
    });
  };

  // Apply user inputs to all relevant triggers
  newContainer.containerVersion.trigger = (templateData.containerVersion.trigger || []).map(tr => {
    switch (tr.name) {
      case 'Home Page':
      case 'Home Page - Windows+FF':
        tr.filter = updateFilterParams(tr.filter, triggerHomeExclude);
        break;
      case 'Landing Pages - Windows+FF':
        tr.filter = updateFilterParams(tr.filter, triggerLandingPath);
        break;
      case 'Click on Download - Main':
        tr.filter = updateFilterParams(tr.filter, triggerClickMain);
        break;
      case 'Click on Download - Header - Windows+FF':
        tr.filter = updateFilterParams(tr.filter, triggerClickHeaderWin);
        break;
      case 'Click on Download - Footer - Windows+FF':
        tr.filter = updateFilterParams(tr.filter, triggerClickFooterWin);
        break;
      // add other cases here if needed
    }
    return tr;
  });

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
