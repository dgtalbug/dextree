const path = require('path');
const fs = require('fs');
const { createIndexer } = require('./packages/core/dist/index.cjs');

async function run() {
  try {
    const workspaceRoot = __dirname;
    const wasmDir = path.join(workspaceRoot, 'packages/extension/dist');
    // It seems createIndexer takes options. Based on the previous error at dirname(this.dbPath)
    // we should check what properties this object should have.
    const core = await createIndexer({ wasmDir, dbPath: ':memory:' });

    const filesToIndex = [
      'packages/core/src/index.ts',
      'packages/extension/src/extension.ts',
      'packages/extension/src/webview/panel.ts'
    ].map(f => path.join(workspaceRoot, f)).filter(f => fs.existsSync(f));

    console.log('Files to index:', filesToIndex);

    for (const filePath of filesToIndex) {
      // indexFile(absolutePath, workspaceRoot)
      await core.indexFile(filePath, workspaceRoot);
    }

    const subgraph = await core.getWorkspaceSubgraph(workspaceRoot);
    const { nodes, edges } = subgraph;

    const nodeIds = nodes.map(n => n.id);
    const edgeIds = edges.filter(e => e && e.id).map(e => e.id);

    const duplicateNodeIds = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index);
    const duplicateEdgeIds = edgeIds.filter((id, index) => edgeIds.indexOf(id) !== index);

    const missingEndpoints = edges.filter(e => !nodeIds.includes(e.source) || !nodeIds.includes(e.target));

    console.log('--- Payload Sanity Summary ---');
    console.log('Node count:', nodes.length);
    console.log('Edge count:', edges.length);
    console.log('Duplicate node IDs:', duplicateNodeIds);
    console.log('Duplicate edge IDs:', duplicateEdgeIds);
    console.log('Edges with missing endpoints:', missingEndpoints.length);
    if (missingEndpoints.length > 0) {
        console.log('Sample missing endpoints edges:', missingEndpoints.slice(0, 5));
    }
    console.log('Sample nodes (first 5):', JSON.stringify(nodes.slice(0, 5), null, 2));
    console.log('Sample edges (first 5):', JSON.stringify(edges.slice(0, 5), null, 2));

  } catch (err) {
    console.error('Thrown error:', err);
    process.exit(1);
  }
}

run();
