const toKebabCase = (value) => String(value || '').replace(/([A-Z])/g, '-$1').toLowerCase();

const resolveGlobalRef = () => (typeof global !== 'undefined' ? global : undefined);

export const exposeSparkGlobals = ({
  AdoleAPI,
  $, 
  define,
  observeMutations,
  componentRegistry,
  Unit,
  unitStaticMethods,
  windowRef = globalThis?.window,
  documentRef = globalThis?.document,
  globalRef = resolveGlobalRef()
}) => {
  if (windowRef) {
    windowRef.AdoleAPI = AdoleAPI;
  }

  if (globalRef) {
    globalRef.AdoleAPI = AdoleAPI;
  }

  if (!windowRef) return;

  windowRef.Squirrel = windowRef.Squirrel || {};
  windowRef.$ = $;
  windowRef.define = define;
  windowRef.observeMutations = observeMutations;
  windowRef.body = documentRef?.body;
  windowRef.toKebabCase = toKebabCase;

  Object.assign(windowRef, componentRegistry);

  const { dropDown, ...namespaceRegistry } = componentRegistry;
  void dropDown;
  Object.assign(windowRef.Squirrel, namespaceRegistry);
  Object.assign(Unit, unitStaticMethods);
};