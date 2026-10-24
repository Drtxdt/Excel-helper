import { createServer } from 'vite';
const server = await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
try {await server.ssrLoadModule('/scripts/validate-content.ts');} finally {await server.close();}
