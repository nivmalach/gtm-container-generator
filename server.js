const express = require('express');
const fs = require('fs');
const path = require('path');


const app = express();
const PORT = 3000;

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

const basicAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  const expected = 'Basic ' + Buffer.from('admin:opsotools').toString('base64');
  if (auth === expected) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Opsotools"');
  res.status(401).send('Authentication required.');
};

app.use(basicAuth);
app.use(express.static('public'));

app.get('/version', (req, res) => {
  res.send(pkg.version);
});

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

  // Dynamically load config for this template
  const configPath = path.join(__dirname, 'configs', template.replace('.json', '.config.json'));
  if (!fs.existsSync(configPath)) return res.status(404).send('Template config not found');

  let configData;
  try {
    configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`⚙️ Loaded config: ${configPath}`);
  } catch (err) {
    return res.status(500).send('Config load failed: ' + err.message);
  }

  const newContainer = {
    ...templateData,
    containerVersion: {
      ...templateData.containerVersion,
      variable: (templateData.containerVersion.variable || []).map(v => {
        const fieldDef = (configData.editableFields.variables || []).find(d => d.name === v.name);
        if (fieldDef && req.query[fieldDef.key] !== undefined) {
          v.parameter[0].value = req.query[fieldDef.key];
        }
        return v;
      }),
      tag: (templateData.containerVersion.tag || []).map(t => {
        (configData.editableFields.tags || []).forEach(tagDef => {
          if (t.name.includes(tagDef.name) && req.query[tagDef.key] && t.parameter) {
            t.parameter.forEach(p => {
              if (p.key === "conversionLabel") p.value = req.query[tagDef.key];
            });
          }
        });
        return t;
      }),
    }
  };

  const updateFilterParamsRecursive = (filters = [], newVal, keyMatch, label) => {
    return filters.map(f => {
      if (Array.isArray(f.filter)) {
        // Recurse into nested filters (e.g., AND/OR compound filters)
        return {
          ...f,
          filter: updateFilterParamsRecursive(f.filter, newVal, keyMatch, label)
        };
      }

      if (!Array.isArray(f.parameter)) return f;

      const newParams = f.parameter.map(p => ({ ...p }));
      const arg0 = newParams.find(p => p.key === 'arg0');
      const arg1 = newParams.find(p => p.key === 'arg1');

      const clean = v => v?.replace(/[{}]/g, '').trim();
      const keyList = Array.isArray(keyMatch) ? keyMatch : [keyMatch];
      const isMatch = (
        arg0 &&
        typeof arg0.value === 'string' &&
        keyList.some(expected => clean(arg0.value) === clean(expected))
      );

      if (isMatch && arg1 && newVal !== undefined && newVal !== '') {
        const prev = arg1.value;
        arg1.value = Array.isArray(newVal) ? newVal[0] : String(newVal);
        console.log(`→ Updated trigger [${label}] ${arg0.value} from "${prev}" → "${arg1.value}"`);
      }

      return { ...f, parameter: newParams };
    });
  };

  // Apply user inputs to all relevant triggers (enhanced version)
  newContainer.containerVersion.trigger = (templateData.containerVersion.trigger || []).map(tr => {
    (configData.editableFields.triggers || []).forEach(triggerDef => {
      if (tr.name === triggerDef.name) {
        const val = req.query[triggerDef.key];
        if (!val) return;

        if (tr.filter) {
          tr.filter = updateFilterParamsRecursive(tr.filter, val, triggerDef.matchArg0, tr.name);
        }
        if (tr.customEventFilter) {
          tr.customEventFilter = updateFilterParamsRecursive(tr.customEventFilter, val, triggerDef.matchArg0, tr.name);
        }
      }
    });

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
