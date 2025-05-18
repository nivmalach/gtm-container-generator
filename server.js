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

  // Generic helper to update any filter’s arg1 based on arg0 match
  const updateFilterParams = (filters = [], newVal, keyMatch, label) => {
    return filters.map(f => {
      if (!Array.isArray(f.parameter)) return f;

      const newParams = f.parameter.map(p => ({ ...p })); // clone parameters
      const arg0 = newParams.find(p => p.key === 'arg0');
      const arg1 = newParams.find(p => p.key === 'arg1');
      const arg0Val = unwrap(arg0?.value || '');
      const shouldUpdate =
        arg0Val === keyMatch ||
        arg0Val.includes(keyMatch) ||
        arg0Val === `{{${keyMatch}}}`;

      if (shouldUpdate && arg1 && newVal !== undefined && newVal !== '') {
        const prev = arg1.value;
        arg1.value = newVal;
        console.log(`→ Updated trigger [${label}] ${keyMatch} from "${prev}" → "${newVal}"`);
      }

      return { ...f, parameter: newParams }; // clone filter and assign new params
    });
  };

  // Apply user inputs to all relevant triggers (stable version)
  newContainer.containerVersion.trigger = (templateData.containerVersion.trigger || []).map(tr => {
    const apply = (target, val, key, label) => {
      if (target) target = updateFilterParams(target, val, key, label);
      return target;
    };

    (configData.editableFields.triggers || []).forEach(triggerDef => {
      if (tr.name === triggerDef.name) {
        const inputVal = req.query[triggerDef.key];
        if (triggerDef.type === 'filter') {
          tr.filter = apply(tr.filter, inputVal, triggerDef.matchArg0, tr.name);
        } else if (triggerDef.type === 'customEventFilter') {
          tr.customEventFilter = apply(tr.customEventFilter, inputVal, triggerDef.matchArg0, tr.name);
        }
      }
    });

    // Also apply to customEventFilter
    if (tr.customEventFilter) {
      tr.customEventFilter = apply(tr.customEventFilter, triggerClickMain, 'eventAction', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerClickHeader, 'eventAction', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerClickHeaderWin, 'eventAction', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerClickFooterWin, 'eventAction', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerClickFooter, 'eventAction', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerClickIndicator, 'eventAction', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerClickMainAlt, 'eventAction', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerTYP, 'eventAction', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerGAHost, 'Page Hostname', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerPronto, 'Page URL', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerTYPUrl, 'Page URL', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerHomePage, 'Page URL', tr.name);
      tr.customEventFilter = apply(tr.customEventFilter, triggerLanding, 'Page Path', tr.name);
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
