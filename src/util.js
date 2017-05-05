export const isEmpty = obj => Object.keys(obj).length === 0;

// Converts object's key names from snake_case to camelCase.
// Only does a shallow conversion (i.e. doesn't process nested objects)
function snakeToCamel(obj) {
  let camelised = {};

  function camelise(string) {
    return string.replace(/_[a-z]/g, (match, offset, string) => 
      offset ? string[offset + 1].toUpperCase() : match);
  }

  Object.keys(obj).forEach(key => camelised[camelise(key)] = obj[key]);
  return camelised;
}
