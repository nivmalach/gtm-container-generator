
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
  const {
    template, ga4, ads,
    labelDownload, labelLPView, labelTYP,
    triggerGAHost, triggerHomeExclude, triggerLandingPath,
    triggerTYPUrl, triggerClickMain, triggerClickHeader,
    triggerClickHeaderWin, triggerClickFooterWin, triggerClickFooter,
    triggerClickIndicator, triggerHomePage, triggerLanding,
    triggerPronto, triggerClickMainAlt, triggerTYP
  } = req.query;

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
        const updateFilter = (field, value, match) => {
          tr.filter = tr.filter.map(f => {
            const isTarget = f.parameter?.some(p => p.key === 'arg0' && p.value.includes(field));
            if (isTarget) {
              f.parameter = f.parameter.map(p => (p.key === 'arg1' ? { ...p, value: match(value) } : p));
            }
            return f;
          });
        };

        const matchEq = v => v;
        const matchRegex = v => `^(?!.*${v}).*$`;

        if (tr.name === 'GA_Event' && triggerGAHost) updateFilter('hostname', triggerGAHost, matchEq);
        if (tr.name === 'Home Page - Windows+FF' && triggerHomeExclude) updateFilter('url', triggerHomeExclude, matchRegex);
        if (tr.name === 'Landing Pages - Windows+FF' && triggerLandingPath) updateFilter('Page Path', triggerLandingPath, matchEq);
        if (tr.name === 'TYP - Windows+FF' && triggerTYPUrl) updateFilter('url', triggerTYPUrl, matchEq);

        if (tr.name === 'Click on Download - Main - Windows+FF' && triggerClickMain)
          updateFilter('eventAction', triggerClickMain, matchEq);
        if (tr.name === 'Click on Download - Header' && triggerClickHeader)
          updateFilter('eventAction', triggerClickHeader, matchEq);
        if (tr.name === 'Click on Download - Header - Windows+FF' && triggerClickHeaderWin)
          updateFilter('eventAction', triggerClickHeaderWin, matchEq);
        if (tr.name === 'Click on Download - Footer - Windows+FF' && triggerClickFooterWin)
          updateFilter('eventAction', triggerClickFooterWin, matchEq);
        if (tr.name === 'Click on Download - Footer' && triggerClickFooter)
          updateFilter('eventAction', triggerClickFooter, matchEq);
        if (tr.name === 'Click on Download - Indicator' && triggerClickIndicator)
          updateFilter('eventAction', triggerClickIndicator, matchEq);

        if (tr.name === 'Home Page' && triggerHomePage) updateFilter('Page Path', triggerHomePage, matchEq);
        if (tr.name === 'Landing Pages' && triggerLanding) updateFilter('Page Path', triggerLanding, matchEq);
        if (tr.name === 'Pronto' && triggerPronto) updateFilter('url', triggerPronto, matchEq);
        if (tr.name === 'Click on Download - Main' && triggerClickMainAlt) updateFilter('eventAction', triggerClickMainAlt, matchEq);
        if (tr.name === 'TYP' && triggerTYP) updateFilter('url', triggerTYP, matchEq);

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
