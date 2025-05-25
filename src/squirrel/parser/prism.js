var createRubyParser = (() => {
  var _scriptName = typeof document != 'undefined' ? document.currentScript?.src : undefined;
  return (
async function(moduleArg = {}) {
  var moduleRtn;

var c=moduleArg,m,p,r=new Promise((a,b)=>{m=a;p=b}),t="object"==typeof window,u="undefined"!=typeof WorkerGlobalScope,v="object"==typeof process&&process.versions?.node&&"renderer"!=process.type;"undefined"!=typeof __filename?_scriptName=__filename:u&&(_scriptName=self.location.href);var w="",x,y;
if(v){var fs=require("fs");require("path");w=__dirname+"/";y=a=>{a=z(a)?new URL(a):a;return fs.readFileSync(a)};x=async a=>{a=z(a)?new URL(a):a;return fs.readFileSync(a,void 0)};process.argv.slice(2)}else if(t||u){try{w=(new URL(".",_scriptName)).href}catch{}u&&(y=a=>{var b=new XMLHttpRequest;b.open("GET",a,!1);b.responseType="arraybuffer";b.send(null);return new Uint8Array(b.response)});x=async a=>{if(z(a))return new Promise((e,d)=>{var f=new XMLHttpRequest;f.open("GET",a,!0);f.responseType="arraybuffer";
f.onload=()=>{200==f.status||0==f.status&&f.response?e(f.response):d(f.status)};f.onerror=d;f.send(null)});var b=await fetch(a,{credentials:"same-origin"});if(b.ok)return b.arrayBuffer();throw Error(b.status+" : "+b.url);}}console.log.bind(console);var B=console.error.bind(console),C,D,E=!1,F,G,z=a=>a.startsWith("file://");
function H(){var a=D.buffer;F=new Int8Array(a);new Int16Array(a);G=new Uint8Array(a);new Uint16Array(a);new Int32Array(a);new Uint32Array(a);new Float32Array(a);new Float64Array(a);new BigInt64Array(a);new BigUint64Array(a)}var I=0,J=null,K;async function L(a){if(!C)try{var b=await x(a);return new Uint8Array(b)}catch{}if(a==K&&C)a=new Uint8Array(C);else if(y)a=y(a);else throw"both async and sync fetching of the wasm failed";return a}
async function M(a,b){try{var e=await L(a);return await WebAssembly.instantiate(e,b)}catch(d){throw B(`failed to asynchronously prepare wasm: ${d}`),a=d,c.onAbort?.(a),a="Aborted("+a+")",B(a),E=!0,a=new WebAssembly.RuntimeError(a+". Build with -sASSERTIONS for more info."),p(a),a;}}
async function N(a){var b=K;if(!C&&"function"==typeof WebAssembly.instantiateStreaming&&!z(b)&&!v)try{var e=fetch(b,{credentials:"same-origin"});return await WebAssembly.instantiateStreaming(e,a)}catch(d){B(`wasm streaming compile failed: ${d}`),B("falling back to ArrayBuffer instantiation")}return M(b,a)}
var O=a=>{for(;0<a.length;)a.shift()(c)},P=[],Q=[],R=()=>{var a=c.preRun.shift();Q.push(a)},T=(a,b,e)=>{var d=G;if(!(0<e))return 0;var f=b;e=b+e-1;for(var h=0;h<a.length;++h){var g=a.charCodeAt(h);if(55296<=g&&57343>=g){var n=a.charCodeAt(++h);g=65536+((g&1023)<<10)|n&1023}if(127>=g){if(b>=e)break;d[b++]=g}else{if(2047>=g){if(b+1>=e)break;d[b++]=192|g>>6}else{if(65535>=g){if(b+2>=e)break;d[b++]=224|g>>12}else{if(b+3>=e)break;d[b++]=240|g>>18;d[b++]=128|g>>12&63}d[b++]=128|g>>6&63}d[b++]=128|g&63}}d[b]=
0;return b-f},U="undefined"!=typeof TextDecoder?new TextDecoder:void 0,V=(a=0,b=NaN)=>{var e=G,d=a+b;for(b=a;e[b]&&!(b>=d);)++b;if(16<b-a&&e.buffer&&U)return U.decode(e.subarray(a,b));for(d="";a<b;){var f=e[a++];if(f&128){var h=e[a++]&63;if(192==(f&224))d+=String.fromCharCode((f&31)<<6|h);else{var g=e[a++]&63;f=224==(f&240)?(f&15)<<12|h<<6|g:(f&7)<<18|h<<12|g<<6|e[a++]&63;65536>f?d+=String.fromCharCode(f):(f-=65536,d+=String.fromCharCode(55296|f>>10,56320|f&1023))}}else d+=String.fromCharCode(f)}return d},
X=(a,b,e,d)=>{var f={string:k=>{var l=0;if(null!==k&&void 0!==k&&0!==k){for(var q=l=0;q<k.length;++q){var A=k.charCodeAt(q);127>=A?l++:2047>=A?l+=2:55296<=A&&57343>=A?(l+=4,++q):l+=3}l+=1;q=W(l);T(k,q,l);l=q}return l},array:k=>{var l=W(k.length);F.set(k,l);return l}};a=c["_"+a];var h=[],g=0;if(d)for(var n=0;n<d.length;n++){var S=f[e[n]];S?(0===g&&(g=aa()),h[n]=S(d[n])):h[n]=d[n]}e=a(...h);return e=function(k){0!==g&&ba(g);return"string"===b?k?V(k):"":"boolean"===b?!!k:k}(e)};c.printErr&&(B=c.printErr);
c.wasmBinary&&(C=c.wasmBinary);c.ccall=X;c.cwrap=(a,b,e,d)=>{var f=!e||e.every(h=>"number"===h||"boolean"===h);return"string"!==b&&f&&!d?c["_"+a]:(...h)=>X(a,b,e,h,d)};c.UTF8ToString=(a,b)=>a?V(a,b):"";c.stringToUTF8=(a,b,e)=>T(a,b,e);c.allocate=(a,b)=>{b=1==b?W(a.length):ca(a.length);a.subarray||a.slice||(a=new Uint8Array(a));G.set(a,b);return b};
var da={a:a=>{var b=G.length;a>>>=0;if(2147483648<a)return!1;for(var e=1;4>=e;e*=2){var d=b*(1+.2/e);d=Math.min(d,a+100663296);a:{d=(Math.min(2147483648,65536*Math.ceil(Math.max(a,d)/65536))-D.buffer.byteLength+65535)/65536|0;try{D.grow(d);H();var f=1;break a}catch(h){}f=void 0}if(f)return!0}return!1}},Y=await (async function(){function a(d){Y=d.exports;D=Y.b;H();I--;c.monitorRunDependencies?.(I);0==I&&J&&(d=J,J=null,d());return Y}I++;c.monitorRunDependencies?.(I);var b={a:da};if(c.instantiateWasm)return new Promise(d=>
{c.instantiateWasm(b,(f,h)=>{d(a(f,h))})});K??=c.locateFile?c.locateFile("ruby-parser.wasm",w):w+"ruby-parser.wasm";try{var e=await N(b);return a(e.instance)}catch(d){return p(d),Promise.reject(d)}}());c._parse_ruby_code=Y.d;var ca=c._malloc=Y.e;c._test_ruby_parser=Y.f;c._free_parser_result=Y.g;c._free=Y.h;c._quick_ruby_parse=Y.i;var ba=Y.j,W=Y.k,aa=Y.l;
function Z(){function a(){c.calledRun=!0;if(!E){Y.c();m(c);c.onRuntimeInitialized?.();if(c.postRun)for("function"==typeof c.postRun&&(c.postRun=[c.postRun]);c.postRun.length;){var b=c.postRun.shift();P.push(b)}O(P)}}if(0<I)J=Z;else{if(c.preRun)for("function"==typeof c.preRun&&(c.preRun=[c.preRun]);c.preRun.length;)R();O(Q);0<I?J=Z:c.setStatus?(c.setStatus("Running..."),setTimeout(()=>{setTimeout(()=>c.setStatus(""),1);a()},1)):a()}}
if(c.preInit)for("function"==typeof c.preInit&&(c.preInit=[c.preInit]);0<c.preInit.length;)c.preInit.shift()();Z();moduleRtn=r;


  return moduleRtn;
}
);
})();
if (typeof exports === 'object' && typeof module === 'object') {
  module.exports = createRubyParser;
  // This default export looks redundant, but it allows TS to import this
  // commonjs style module.
  module.exports.default = createRubyParser;
} else if (typeof define === 'function' && define['amd'])
  define([], () => createRubyParser);
