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
      trigger: (templateData.containerVersion.trigger || []).map(tr => {
        tr.filter = (tr.filter || []).map(f => {
          const getParam = key => f.parameter?.find(p => p.key === key);

          // GA_Event - hostname
          if (tr.name.includes('GA_Event') && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'Page Hostname') && triggerGAHost) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerGAHost } : p));
          }

          // Home Page / Home Page - Windows+FF – URL does not contain
          if (tr.name.includes('Home Page') && triggerHomePage && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'Page URL')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerHomePage } : p));
          }
          if (tr.name.includes('Home Page - Windows+FF') && triggerHomeExclude && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'Page URL')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerHomeExclude } : p));
          }

          // TYP / TYP - Windows+FF – URL contains
          if (tr.name.includes('TYP') && (triggerTYP || triggerTYPUrl) && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'Page URL')) {
            const val = triggerTYP || triggerTYPUrl;
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: val } : p));
          }
          if (tr.name.includes('TYP - Windows+FF') && triggerTYPUrl && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'Page URL')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerTYPUrl } : p));
          }

          // Pronto – URL contains
          if (tr.name.includes('Pronto') && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'Page URL') && triggerPronto) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerPronto } : p));
          }

          // Page Path & eventAction mappings
          const matchArg1 = (fieldVal, newVal) =>
            f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === fieldVal)
              ? f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: newVal } : p))
              : f.parameter;

          if (tr.name.includes('Landing Pages - Windows+FF') && triggerLandingPath && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'Page Path')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerLandingPath } : p));
          }
          if (tr.name.includes('Landing Pages') && triggerLanding) f.parameter = matchArg1('Page Path', triggerLanding);

          if (tr.name.includes('Click on Download - Main - Windows+FF') && triggerClickMain && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickMain } : p));
          }
          if (tr.name.includes('Click on Download - Header') && triggerClickHeader && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickHeader } : p));
          }
          if (tr.name.includes('Click on Download - Header - Windows+FF') && triggerClickHeaderWin && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickHeaderWin } : p));
          }
          if (tr.name.includes('Click on Download - Footer - Windows+FF') && triggerClickFooterWin && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickFooterWin } : p));
          }
          if (tr.name.includes('Click on Download - Footer') && triggerClickFooter && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickFooter } : p));
          }
          if (tr.name.includes('Click on Download - Indicator') && triggerClickIndicator && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickIndicator } : p));
          }
          if (tr.name.includes('Click on Download - Main') && triggerClickMainAlt && f.parameter?.some(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickMainAlt } : p));
          }

          // Preserve negate key if present
          if (f.negate !== undefined) {
            const negateValue = f.negate;
            f.parameter = f.parameter.map(p => p);
            f.negate = negateValue;
          }

          return f;
        });
        return tr;
      })
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
