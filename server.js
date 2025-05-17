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
          const unwrapVal = val => val?.replace(/[{}]/g, '').trim();

          // GA_Event - hostname
          if (tr.name.includes('GA_Event') && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'Page Hostname') && triggerGAHost) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerGAHost } : p));
          }

          // Home Page / Home Page - Windows+FF – URL does not contain
          if ((tr.name === 'Home Page' || tr.name === 'Home Page - Windows+FF') && triggerHomePage && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'Page URL' && f.negate === true)) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerHomePage } : p));
            // preserve negate
            f.negate = f.negate;
          }
          if (tr.name.includes('Home Page - Windows+FF') && triggerHomeExclude && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'Page URL')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerHomeExclude } : p));
            f.negate = f.negate;
          }

          // TYP / TYP - Windows+FF – URL contains
          if (tr.name.includes('TYP') && (triggerTYPUrl || triggerTYP) && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'Page URL')) {
            const val = triggerTYPUrl || triggerTYP;
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: val } : p));
            f.negate = f.negate;
          }

          // Pronto – URL contains
          if (tr.name.includes('Pronto') && triggerPronto && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'Page URL')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerPronto } : p));
            f.negate = f.negate;
          }

          // Landing Pages & Landing Pages - Windows+FF – Page Path
          if (tr.name.includes('Landing Pages - Windows+FF') && triggerLandingPath && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'Page Path')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerLandingPath } : p));
            f.negate = f.negate;
          }
          if (tr.name.includes('Landing Pages') && triggerLanding && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'Page Path')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerLanding } : p));
            f.negate = f.negate;
          }

          // Click on Download triggers - eventAction filters
          if (tr.name.includes('Click on Download')) {
            if (triggerClickMain && tr.name === 'Click on Download - Main' && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === '{{eventAction}}' && f.type === 'EQUALS')) {
              f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickMain } : p));
              f.negate = f.negate;
            }
            if (triggerClickMainAlt && tr.name === 'Click on Download - Main' && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'eventAction')) {
              f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickMainAlt } : p));
              f.negate = f.negate;
            }
            if (triggerClickHeader && tr.name.includes('Click on Download - Header') && !tr.name.includes('Windows+FF') && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'eventAction')) {
              f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickHeader } : p));
              f.negate = f.negate;
            }
            if (triggerClickHeaderWin && tr.name.includes('Click on Download - Header - Windows+FF') && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'eventAction')) {
              f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickHeaderWin } : p));
              f.negate = f.negate;
            }
            if (triggerClickFooterWin && tr.name.includes('Click on Download - Footer - Windows+FF') && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'eventAction')) {
              f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickFooterWin } : p));
              f.negate = f.negate;
            }
            if (triggerClickFooter && tr.name.includes('Click on Download - Footer') && !tr.name.includes('Windows+FF') && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'eventAction')) {
              f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickFooter } : p));
              f.negate = f.negate;
            }
            if (triggerClickIndicator && tr.name.includes('Click on Download - Indicator') && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'eventAction')) {
              f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerClickIndicator } : p));
              f.negate = f.negate;
            }
          }

          return f;
        });
        console.log(`Processed trigger: ${tr.name}`);
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
