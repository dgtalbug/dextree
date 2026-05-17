const core = require('./packages/core/dist/index.cjs');
console.log('Core keys:', Object.keys(core));
console.log('Core.default keys:', core.default ? Object.keys(core.default) : 'no default');
