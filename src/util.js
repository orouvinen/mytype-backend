export const isEmpty = obj => Object.keys(obj).length === 0;

// Converts object's key names from snake_case to camelCase.
// Processes nested objects.
// Returns the camelCased object.
export function snakeToCamel(obj) {
  let camelised = {};

  // Don't trip on timestamps
  if (obj instanceof Date)
    return obj;

  function camelise(snake) {
    return snake.replace(/_[a-z]/g, (match, offset, string) => 
      offset ? string[offset + 1].toUpperCase() : match);
  }

  if (Array.isArray(obj))
    return obj.map(element => snakeToCamel(element));

  Object.keys(obj).forEach(key => {
    // New property name
    const camelKey = camelise(key);
    
    // Convert properties inside array members
    if (Array.isArray(obj[key]))
      obj[key] = obj[key].map(o => typeof(o) === 'object' ? snakeToCamel(o) : o);

    // Convert nested objects
    if (typeof(obj[key]) === 'object' && !Array.isArray(obj[key]))
      camelised[camelKey] = snakeToCamel(obj[key]);
    else // And finally, plain values
      camelised[camelKey] = obj[key];
  });
  return camelised;
}
