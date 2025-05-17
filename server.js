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
          const getArgVal = key => f.parameter?.find(p => p.key === key)?.value;
          const setArgVal = (key, newVal) => {
            f.parameter = f.parameter.map(p => p.key === key ? { ...p, value: newVal } : p);
          };

          const unwrapVal = val => val?.replace(/[{}]/g, '').trim();

          // GA_Event - hostname
          if (tr.name.includes('GA_Event') && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'Page Hostname') && triggerGAHost) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerGAHost } : p));
          }

          // Home Page (fixed)
          if ((tr.name === 'Home Page' || tr.name === 'Home Page - Windows+FF') && triggerHomeExclude) {
            if (unwrapVal(getArgVal('arg0')) === 'Page URL') {
              setArgVal('arg1', triggerHomeExclude);
              console.log(`→ Updated ${tr.name} arg1 to`, triggerHomeExclude);
            }
          }

          // TYP / TYP - Windows+FF – URL contains
          if (tr.name.includes('TYP - Windows+FF') && (triggerTYPUrl || triggerTYP)) {
            const val = triggerTYPUrl || triggerTYP;
            const match = f.parameter?.find(p => p.key === 'arg0' && unwrap(p.value) === 'Page URL');
            const target = f.parameter?.find(p => p.key === 'arg1');
            if (match && target && target.value !== val) {
              target.value = val;
              console.log(`→ Updated ${tr.name} arg1 to`, val);
            }
          }
          if (tr.name.includes('TYP') && !(tr.name.includes('TYP - Windows+FF'))) {
            if (triggerTYPUrl || triggerTYP) {
              const val = triggerTYPUrl || triggerTYP;
              f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: val } : p));
              f.negate = f.negate;
            }
          }

          // Pronto – URL contains
          if (tr.name.includes('Pronto') && triggerPronto && f.parameter?.some(p => p.key === 'arg0' && unwrapVal(p.value) === 'Page URL')) {
            f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: triggerPronto } : p));
            f.negate = f.negate;
          }

          // Landing Pages - Windows+FF (fixed)
          if (tr.name === 'Landing Pages - Windows+FF' && triggerLandingPath) {
            if (unwrapVal(getArgVal('arg0')) === 'Page Path') {
              setArgVal('arg1', triggerLandingPath);
              console.log(`→ Updated ${tr.name} arg1 to`, triggerLandingPath);
            }
          }
          if (tr.name.includes('Landing Pages') && !tr.name.includes('Landing Pages - Windows+FF') && triggerLanding) {
            const match = f.parameter?.find(p => p.key === 'arg0' && unwrap(p.value) === 'Page Path');
            const target = f.parameter?.find(p => p.key === 'arg1');
            if (match && target && target.value !== triggerLanding) {
              target.value = triggerLanding;
              console.log(`→ Updated ${tr.name} arg1 to`, triggerLanding);
            }
          }

          // Click on Download triggers - eventAction filters
          if (tr.name.includes('Click on Download - Main - Windows+FF') && triggerClickMainAlt) {
            const match = f.parameter?.find(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction');
            const target = f.parameter?.find(p => p.key === 'arg1');
            if (match && target && target.value !== triggerClickMainAlt) {
              target.value = triggerClickMainAlt;
              console.log(`→ Updated ${tr.name} eventAction to`, triggerClickMainAlt);
            }
          }
          // Click on Download - Main (fixed)
          if (tr.name.includes('Click on Download - Main') && triggerClickMain) {
            f.parameter = f.parameter.map(p =>
              p.key === 'arg1' && unwrap(f.parameter.find(x => x.key === 'arg0')?.value) === 'eventAction'
                ? { ...p, value: triggerClickMain }
                : p
            );
          }
          if (tr.name.includes('Click on Download - Header - Windows+FF') && triggerClickHeaderWin) {
            if (unwrapVal(getArgVal('arg0')) === 'eventAction') {
              setArgVal('arg1', triggerClickHeaderWin);
              console.log(`→ Updated ${tr.name} arg1 to`, triggerClickHeaderWin);
            }
          }
          if (tr.name.includes('Click on Download - Footer - Windows+FF') && triggerClickFooterWin) {
            if (unwrapVal(getArgVal('arg0')) === 'eventAction') {
              setArgVal('arg1', triggerClickFooterWin);
              console.log(`→ Updated ${tr.name} arg1 to`, triggerClickFooterWin);
            }
          }
          if (tr.name.includes('Click on Download - Header') && !tr.name.includes('Windows+FF') && triggerClickHeader) {
            const match = f.parameter?.find(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction');
            const target = f.parameter?.find(p => p.key === 'arg1');
            if (match && target && target.value !== triggerClickHeader) {
              target.value = triggerClickHeader;
              console.log(`→ Updated ${tr.name} arg1 to`, triggerClickHeader);
            }
          }
          if (tr.name.includes('Click on Download - Footer') && !tr.name.includes('Windows+FF') && triggerClickFooter) {
            const match = f.parameter?.find(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction');
            const target = f.parameter?.find(p => p.key === 'arg1');
            if (match && target && target.value !== triggerClickFooter) {
              target.value = triggerClickFooter;
              console.log(`→ Updated ${tr.name} arg1 to`, triggerClickFooter);
            }
          }
          if (tr.name.includes('Click on Download - Indicator') && triggerClickIndicator) {
            const match = f.parameter?.find(p => p.key === 'arg0' && unwrap(p.value) === 'eventAction');
            const target = f.parameter?.find(p => p.key === 'arg1');
            if (match && target && target.value !== triggerClickIndicator) {
              target.value = triggerClickIndicator;
              console.log(`→ Updated ${tr.name} arg1 to`, triggerClickIndicator);
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
