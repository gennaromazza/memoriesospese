export const ref = (...args: any[]) => ({ args });
export const getStorage = () => ({});
export const connectStorageEmulator = () => {};
export const uploadBytes = async () => ({});
export const uploadBytesResumable = () => { throw new Error("Storage disabled in isolated harness"); };
export const getDownloadURL = async () => "";
export const deleteObject = async () => {};
export const getMetadata = async () => ({});
export const listAll = async () => ({ items: [], prefixes: [] });