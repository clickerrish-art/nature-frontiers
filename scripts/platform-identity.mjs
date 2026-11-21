export function platformIdentityError(actualId, expectedId, label) {
  if (typeof expectedId !== "string" || !/^\\d+$/.test(expectedId)) {
    return label + " expected ID must be configured as a numeric owner-approved value.";
  }
  if (typeof actualId !== "string" || !/^\\d+$/.test(actualId)) {
    return label + " actual ID must be numeric.";
  }
  if (actualId !== expectedId) {
    return label + " actual ID does not match the owner-approved expected ID.";
  }
  return null;
}
