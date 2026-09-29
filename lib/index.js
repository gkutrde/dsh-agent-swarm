import { randomUUID } from "node:crypto";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region node_modules/.pnpm/cosmokit@1.8.1/node_modules/cosmokit/lib/index.cjs
var require_lib$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var index_exports = {};
	__export(index_exports, {
		Binary: () => Binary,
		Time: () => Time,
		arrayBufferToBase64: () => arrayBufferToBase64,
		arrayBufferToHex: () => arrayBufferToHex,
		base64ToArrayBuffer: () => base64ToArrayBuffer,
		camelCase: () => camelCase,
		camelize: () => camelize,
		capitalize: () => capitalize,
		clone: () => clone,
		contain: () => contain,
		deduplicate: () => deduplicate,
		deepEqual: () => deepEqual,
		defineProperty: () => defineProperty,
		difference: () => difference,
		filterKeys: () => filterKeys,
		formatProperty: () => formatProperty,
		hexToArrayBuffer: () => hexToArrayBuffer,
		hyphenate: () => hyphenate,
		intersection: () => intersection,
		is: () => is,
		isNonNullable: () => isNonNullable,
		isNullable: () => isNullable,
		isPlainObject: () => isPlainObject,
		makeArray: () => makeArray,
		mapValues: () => mapValues,
		noop: () => noop,
		omit: () => omit,
		paramCase: () => paramCase,
		pick: () => pick,
		remove: () => remove,
		sanitize: () => sanitize,
		snakeCase: () => snakeCase,
		trimSlash: () => trimSlash,
		uncapitalize: () => uncapitalize,
		union: () => union,
		valueMap: () => mapValues
	});
	module.exports = __toCommonJS(index_exports);
	function noop() {}
	function isNullable(value) {
		return value === null || value === void 0;
	}
	function isNonNullable(value) {
		return !isNullable(value);
	}
	function isPlainObject(data) {
		return data && typeof data === "object" && !Array.isArray(data);
	}
	function filterKeys(object, filter) {
		return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
	}
	function mapValues(object, transform) {
		return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
	}
	function pick(source, keys, forced) {
		if (!keys) return { ...source };
		const result = {};
		for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
		return result;
	}
	function omit(source, keys) {
		if (!keys) return { ...source };
		const result = { ...source };
		for (const key of keys) Reflect.deleteProperty(result, key);
		return result;
	}
	function defineProperty(object, key, value) {
		return Object.defineProperty(object, key, {
			writable: true,
			value,
			enumerable: false
		});
	}
	function contain(array1, array2) {
		return array2.every((item) => array1.includes(item));
	}
	function intersection(array1, array2) {
		return array1.filter((item) => array2.includes(item));
	}
	function difference(array1, array2) {
		return array1.filter((item) => !array2.includes(item));
	}
	function union(array1, array2) {
		return Array.from(/* @__PURE__ */ new Set([...array1, ...array2]));
	}
	function deduplicate(array) {
		return [...new Set(array)];
	}
	function remove(list, item) {
		const index = list?.indexOf(item);
		if (index >= 0) {
			list.splice(index, 1);
			return true;
		} else return false;
	}
	function makeArray(source) {
		return Array.isArray(source) ? source : isNullable(source) ? [] : [source];
	}
	function is(type, value) {
		if (arguments.length === 1) return (value2) => is(type, value2);
		return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
	}
	function isArrayBufferLike(value) {
		return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
	}
	function isArrayBufferSource(value) {
		return isArrayBufferLike(value) || ArrayBuffer.isView(value);
	}
	var Binary;
	((Binary2) => {
		Binary2.is = isArrayBufferLike;
		Binary2.isSource = isArrayBufferSource;
		function fromSource(source) {
			if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
			else return source;
		}
		Binary2.fromSource = fromSource;
		function toBase64(source) {
			source = fromSource(source);
			if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
			let binary = "";
			const bytes = new Uint8Array(source);
			for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
			return btoa(binary);
		}
		Binary2.toBase64 = toBase64;
		function fromBase64(source) {
			if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
			return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
		}
		Binary2.fromBase64 = fromBase64;
		function toHex(source) {
			source = fromSource(source);
			if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
			return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
		}
		Binary2.toHex = toHex;
		function fromHex(source) {
			if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
			const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
			const buffer = [];
			for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
			return Uint8Array.from(buffer).buffer;
		}
		Binary2.fromHex = fromHex;
	})(Binary || (Binary = {}));
	var base64ToArrayBuffer = Binary.fromBase64;
	var arrayBufferToBase64 = Binary.toBase64;
	var hexToArrayBuffer = Binary.fromHex;
	var arrayBufferToHex = Binary.toHex;
	function clone(source, refs = /* @__PURE__ */ new Map()) {
		if (!source || typeof source !== "object") return source;
		if (is("Date", source)) return new Date(source.valueOf());
		if (is("RegExp", source)) return new RegExp(source.source, source.flags);
		if (isArrayBufferLike(source)) return source.slice(0);
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		const cached = refs.get(source);
		if (cached) return cached;
		if (Array.isArray(source)) {
			const result2 = [];
			refs.set(source, result2);
			source.forEach((value, index) => {
				result2[index] = Reflect.apply(clone, null, [value, refs]);
			});
			return result2;
		}
		const result = Object.create(Object.getPrototypeOf(source));
		refs.set(source, result);
		for (const key of Reflect.ownKeys(source)) {
			const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
			if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
			Reflect.defineProperty(result, key, descriptor);
		}
		return result;
	}
	function deepEqual(a, b, strict) {
		if (a === b) return true;
		if (!strict && isNullable(a) && isNullable(b)) return true;
		if (typeof a !== typeof b) return false;
		if (typeof a !== "object") return false;
		if (!a || !b) return false;
		function check(test, then) {
			return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
		}
		return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
			if (a2.byteLength !== b2.byteLength) return false;
			const viewA = new Uint8Array(a2);
			const viewB = new Uint8Array(b2);
			for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
			return true;
		}) ?? Object.keys({
			...a,
			...b
		}).every((key) => deepEqual(a[key], b[key], strict));
	}
	function capitalize(source) {
		return source.charAt(0).toUpperCase() + source.slice(1);
	}
	function uncapitalize(source) {
		return source.charAt(0).toLowerCase() + source.slice(1);
	}
	function camelCase(source) {
		return source.replace(/[_-][a-z]/g, (str) => str.slice(1).toUpperCase());
	}
	function tokenize(source, delimiters, delimiter) {
		const output = [];
		let state = 0;
		for (let i = 0; i < source.length; i++) {
			const code = source.charCodeAt(i);
			if (code >= 65 && code <= 90) {
				if (state === 1) {
					const next = source.charCodeAt(i + 1);
					if (next >= 97 && next <= 122) output.push(delimiter);
					output.push(code + 32);
				} else {
					if (state !== 0) output.push(delimiter);
					output.push(code + 32);
				}
				state = 1;
			} else if (code >= 97 && code <= 122) {
				output.push(code);
				state = 2;
			} else if (delimiters.includes(code)) {
				if (state !== 0) output.push(delimiter);
				state = 0;
			} else output.push(code);
		}
		return String.fromCharCode(...output);
	}
	function paramCase(source) {
		return tokenize(source, [45, 95], 45);
	}
	function snakeCase(source) {
		return tokenize(source, [45, 95], 95);
	}
	var camelize = camelCase;
	var hyphenate = paramCase;
	function formatProperty(key) {
		if (typeof key !== "string") return `[${key.toString()}]`;
		return /^[a-z_$][\w$]*$/i.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
	}
	function trimSlash(source) {
		return source.replace(/\/$/, "");
	}
	function sanitize(source) {
		if (!source.startsWith("/")) source = "/" + source;
		return trimSlash(source);
	}
	var Time;
	((Time2) => {
		Time2.millisecond = 1;
		Time2.second = 1e3;
		Time2.minute = Time2.second * 60;
		Time2.hour = Time2.minute * 60;
		Time2.day = Time2.hour * 24;
		Time2.week = Time2.day * 7;
		let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
		function setTimezoneOffset(offset) {
			timezoneOffset = offset;
		}
		Time2.setTimezoneOffset = setTimezoneOffset;
		function getTimezoneOffset() {
			return timezoneOffset;
		}
		Time2.getTimezoneOffset = getTimezoneOffset;
		function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
			if (typeof date === "number") date = new Date(date);
			if (offset === void 0) offset = timezoneOffset;
			return Math.floor((date.valueOf() / Time2.minute - offset) / 1440);
		}
		Time2.getDateNumber = getDateNumber;
		function fromDateNumber(value, offset) {
			const date = new Date(value * Time2.day);
			if (offset === void 0) offset = timezoneOffset;
			return new Date(+date + offset * Time2.minute);
		}
		Time2.fromDateNumber = fromDateNumber;
		const numeric = /\d+(?:\.\d+)?/.source;
		const timeRegExp = new RegExp(`^${[
			"w(?:eek(?:s)?)?",
			"d(?:ay(?:s)?)?",
			"h(?:our(?:s)?)?",
			"m(?:in(?:ute)?(?:s)?)?",
			"s(?:ec(?:ond)?(?:s)?)?"
		].map((unit) => `(${numeric}${unit})?`).join("")}$`);
		function parseTime(source) {
			const capture = timeRegExp.exec(source);
			if (!capture) return 0;
			return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
		}
		Time2.parseTime = parseTime;
		function parseDate(date) {
			const parsed = parseTime(date);
			if (parsed) date = Date.now() + parsed;
			else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
			else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
			return date ? new Date(date) : /* @__PURE__ */ new Date();
		}
		Time2.parseDate = parseDate;
		function format(ms) {
			const abs = Math.abs(ms);
			if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
			else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
			else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
			else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
			return ms + "ms";
		}
		Time2.format = format;
		function toDigits(source, length = 2) {
			return source.toString().padStart(length, "0");
		}
		Time2.toDigits = toDigits;
		function template(template2, time = /* @__PURE__ */ new Date()) {
			return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
		}
		Time2.template = template;
	})(Time || (Time = {}));
	0 && (module.exports = {
		Binary,
		Time,
		arrayBufferToBase64,
		arrayBufferToHex,
		base64ToArrayBuffer,
		camelCase,
		camelize,
		capitalize,
		clone,
		contain,
		deduplicate,
		deepEqual,
		defineProperty,
		difference,
		filterKeys,
		formatProperty,
		hexToArrayBuffer,
		hyphenate,
		intersection,
		is,
		isNonNullable,
		isNullable,
		isPlainObject,
		makeArray,
		mapValues,
		noop,
		omit,
		paramCase,
		pick,
		remove,
		sanitize,
		snakeCase,
		trimSlash,
		uncapitalize,
		union,
		valueMap
	});
}));
//#endregion
//#region src/scheduler.ts
var import_lib = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __defProp = Object.defineProperty;
	var __name = (target, value) => __defProp(target, "name", {
		value,
		configurable: true
	});
	var import_cosmokit = require_lib$1();
	var kSchema = Symbol.for("schemastery");
	var kValidationError = Symbol.for("ValidationError");
	globalThis.__schemastery_index__ ??= 0;
	globalThis.__schemastery_refs__ = void 0;
	var ValidationError = class extends TypeError {
		constructor(message, options) {
			let prefix = "$";
			for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
			else if (typeof segment === "number") prefix += "[" + segment + "]";
			else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
			if (prefix.startsWith(".")) prefix = prefix.slice(1);
			super((prefix === "$" ? "" : `${prefix} `) + message);
			this.options = options;
		}
		static {
			__name(this, "ValidationError");
		}
		name = "ValidationError";
		static is(error) {
			return !!error?.[kValidationError];
		}
	};
	Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
	var Schema = /* @__PURE__ */ __name(function(options) {
		const schema = /* @__PURE__ */ __name(function(data, options2 = {}) {
			return Schema.resolve(data, schema, options2)[0];
		}, "schema");
		if (options.refs) {
			const refs = (0, import_cosmokit.valueMap)(options.refs, (options2) => new Schema(options2));
			const getRef = /* @__PURE__ */ __name((uid) => refs[uid], "getRef");
			for (const key in refs) {
				const options2 = refs[key];
				options2.sKey = getRef(options2.sKey);
				options2.inner = getRef(options2.inner);
				options2.list = options2.list && options2.list.map(getRef);
				options2.dict = options2.dict && (0, import_cosmokit.valueMap)(options2.dict, getRef);
			}
			return refs[options.uid];
		}
		Object.assign(schema, options);
		if (typeof schema.callback === "string") try {
			schema.callback = new Function("return " + schema.callback)();
		} catch {}
		Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
		Object.setPrototypeOf(schema, Schema.prototype);
		schema.meta ||= {};
		schema.toString = schema.toString.bind(schema);
		return schema;
	}, "Schema");
	Schema.prototype = Object.create(Function.prototype);
	Schema.prototype[kSchema] = true;
	Object.defineProperty(Schema.prototype, "~standard", { get() {
		return {
			version: 1,
			vendor: "schemastery",
			validate: /* @__PURE__ */ __name((value) => {
				try {
					return { value: Schema.resolve(value, this, {})[0] };
				} catch (error) {
					if (ValidationError.is(error)) return { issues: [{
						message: error.message,
						path: error.options.path
					}] };
					throw error;
				}
			}, "validate")
		};
	} });
	Schema.ValidationError = ValidationError;
	Schema.prototype.toJSON = /* @__PURE__ */ __name(function toJSON() {
		if (globalThis.__schemastery_refs__) {
			globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
			return this.uid;
		}
		globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
		globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
		const result = {
			uid: this.uid,
			refs: globalThis.__schemastery_refs__
		};
		globalThis.__schemastery_refs__ = void 0;
		return result;
	}, "toJSON");
	Schema.prototype.set = /* @__PURE__ */ __name(function set(key, value) {
		this.dict[key] = value;
		return this;
	}, "set");
	Schema.prototype.push = /* @__PURE__ */ __name(function push(value) {
		this.list.push(value);
		return this;
	}, "push");
	function mergeDesc(original, messages) {
		const result = typeof original === "string" ? { "": original } : { ...original };
		for (const locale in messages) {
			const value = messages[locale];
			if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
			else if (typeof value === "string") result[locale] = value;
		}
		return result;
	}
	__name(mergeDesc, "mergeDesc");
	function getInner(value) {
		return value?.$value ?? value?.$inner;
	}
	__name(getInner, "getInner");
	function extractKeys(data) {
		return (0, import_cosmokit.filterKeys)(data ?? {}, (key) => !key.startsWith("$"));
	}
	__name(extractKeys, "extractKeys");
	Schema.prototype.i18n = /* @__PURE__ */ __name(function i18n(messages) {
		const schema = Schema(this);
		const desc = mergeDesc(schema.meta.description, messages);
		if (Object.keys(desc).length) schema.meta.description = desc;
		if (schema.dict) schema.dict = (0, import_cosmokit.valueMap)(schema.dict, (inner, key) => {
			return inner.i18n((0, import_cosmokit.valueMap)(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
		});
		if (schema.list) schema.list = schema.list.map((inner, index) => {
			return inner.i18n((0, import_cosmokit.valueMap)(messages, (data = {}) => {
				if (Array.isArray(getInner(data))) return getInner(data)[index];
				if (Array.isArray(data)) return data[index];
				return extractKeys(data);
			}));
		});
		if (schema.inner) schema.inner = schema.inner.i18n((0, import_cosmokit.valueMap)(messages, (data) => {
			if (getInner(data)) return getInner(data);
			return extractKeys(data);
		}));
		if (schema.sKey) schema.sKey = schema.sKey.i18n((0, import_cosmokit.valueMap)(messages, (data) => data?.$key));
		return schema;
	}, "i18n");
	Schema.prototype.extra = /* @__PURE__ */ __name(function extra(key, value) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			[key]: value
		};
		return schema;
	}, "extra");
	for (const key of [
		"required",
		"disabled",
		"collapse",
		"hidden",
		"loose"
	]) Object.assign(Schema.prototype, { [key](value = true) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			[key]: value
		};
		return schema;
	} });
	Schema.prototype.deprecated = /* @__PURE__ */ __name(function deprecated() {
		const schema = Schema(this);
		schema.meta.badges ||= [];
		schema.meta.badges.push({
			text: "deprecated",
			type: "danger"
		});
		return schema;
	}, "deprecated");
	Schema.prototype.experimental = /* @__PURE__ */ __name(function experimental() {
		const schema = Schema(this);
		schema.meta.badges ||= [];
		schema.meta.badges.push({
			text: "experimental",
			type: "warning"
		});
		return schema;
	}, "experimental");
	Schema.prototype.pattern = /* @__PURE__ */ __name(function pattern(regexp) {
		const schema = Schema(this);
		const pattern2 = (0, import_cosmokit.pick)(regexp, ["source", "flags"]);
		schema.meta = {
			...schema.meta,
			pattern: pattern2
		};
		return schema;
	}, "pattern");
	Schema.prototype.simplify = /* @__PURE__ */ __name(function simplify(value) {
		if ((0, import_cosmokit.deepEqual)(value, this.meta.default, this.type === "dict")) return null;
		if ((0, import_cosmokit.isNullable)(value)) return value;
		if (this.type === "object" || this.type === "dict") {
			const result = {};
			for (const key in value) {
				const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
				if (this.type === "dict" || !(0, import_cosmokit.isNullable)(item)) result[key] = item;
			}
			if ((0, import_cosmokit.deepEqual)(result, this.meta.default, this.type === "dict")) return null;
			return result;
		} else if (this.type === "array" || this.type === "tuple") {
			const result = [];
			value.forEach((value2, index) => {
				const schema = this.type === "array" ? this.inner : this.list[index];
				const item = schema ? schema.simplify(value2) : value2;
				result.push(item);
			});
			return result;
		} else if (this.type === "intersect") {
			const result = {};
			for (const item of this.list) Object.assign(result, item.simplify(value));
			return result;
		} else if (this.type === "union") for (const schema of this.list) try {
			Schema.resolve(value, schema, {});
			return schema.simplify(value);
		} catch {}
		return value;
	}, "simplify");
	Schema.prototype.toString = /* @__PURE__ */ __name(function toString(inline) {
		return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
	}, "toString");
	Schema.prototype.role = /* @__PURE__ */ __name(function role(role, extra2) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			role,
			extra: extra2
		};
		return schema;
	}, "role");
	for (const key of [
		"default",
		"link",
		"comment",
		"description",
		"max",
		"min",
		"step"
	]) Object.assign(Schema.prototype, { [key](value) {
		const schema = Schema(this);
		schema.meta = {
			...schema.meta,
			[key]: value
		};
		return schema;
	} });
	var resolvers = {};
	Schema.extend = /* @__PURE__ */ __name(function extend(type, resolve2) {
		resolvers[type] = resolve2;
	}, "extend");
	Schema.resolve = /* @__PURE__ */ __name(function resolve(data, schema, options = {}, strict = false) {
		if (!schema) return [data];
		if (options.ignore?.(data, schema)) return [data];
		if ((0, import_cosmokit.isNullable)(data) && schema.type !== "lazy") {
			if (schema.meta.required) throw new ValidationError(`missing required value`, options);
			let current = schema;
			let fallback = schema.meta.default;
			while (current?.type === "intersect" && (0, import_cosmokit.isNullable)(fallback)) {
				current = current.list[0];
				fallback = current?.meta.default;
			}
			if ((0, import_cosmokit.isNullable)(fallback)) return [data];
			data = (0, import_cosmokit.clone)(fallback);
		}
		const callback = resolvers[schema.type];
		if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
		try {
			return callback(data, schema, options, strict);
		} catch (error) {
			if (!schema.meta.loose) throw error;
			return [schema.meta.default];
		}
	}, "resolve");
	Schema.from = /* @__PURE__ */ __name(function from(source) {
		if ((0, import_cosmokit.isNullable)(source)) return Schema.any();
		else if ([
			"string",
			"number",
			"boolean"
		].includes(typeof source)) return Schema.const(source).required();
		else if (source[kSchema]) return source;
		else if (typeof source === "function") switch (source) {
			case String: return Schema.string().required();
			case Number: return Schema.number().required();
			case Boolean: return Schema.boolean().required();
			case Function: return Schema.function().required();
			default: return Schema.is(source).required();
		}
		else throw new TypeError(`cannot infer schema from ${source}`);
	}, "from");
	Schema.lazy = /* @__PURE__ */ __name(function lazy(builder) {
		const schema = new Schema({
			type: "lazy",
			builder,
			inner: { toJSON: /* @__PURE__ */ __name(() => {
				if (!schema.inner[kSchema]) {
					schema.inner = schema.builder();
					schema.inner.meta = {
						...schema.meta,
						...schema.inner.meta
					};
				}
				return schema.inner.toJSON();
			}, "toJSON") }
		});
		return schema;
	}, "lazy");
	Schema.natural = /* @__PURE__ */ __name(function natural() {
		return Schema.number().step(1).min(0);
	}, "natural");
	Schema.percent = /* @__PURE__ */ __name(function percent() {
		return Schema.number().step(.01).min(0).max(1).role("slider");
	}, "percent");
	Schema.date = /* @__PURE__ */ __name(function date() {
		return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
			const date2 = new Date(value);
			if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
			return date2;
		}, true)]);
	}, "date");
	Schema.regExp = /* @__PURE__ */ __name(function regExp(flag = "") {
		return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
			try {
				return new RegExp(value, flag);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)]);
	}, "regExp");
	Schema.arrayBuffer = /* @__PURE__ */ __name(function arrayBuffer(encoding) {
		return Schema.union([
			Schema.is(ArrayBuffer),
			Schema.is(SharedArrayBuffer),
			Schema.transform(Schema.any(), (value, options) => {
				if (import_cosmokit.Binary.isSource(value)) return import_cosmokit.Binary.fromSource(value);
				throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
			}, true),
			...encoding ? [Schema.transform(Schema.string(), (value, options) => {
				try {
					return encoding === "base64" ? import_cosmokit.Binary.fromBase64(value) : import_cosmokit.Binary.fromHex(value);
				} catch (e) {
					throw new ValidationError(e.message, options);
				}
			}, true)] : []
		]);
	}, "arrayBuffer");
	Schema.extend("lazy", (data, schema, options, strict) => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return Schema.resolve(data, schema.inner, options, strict);
	});
	Schema.extend("any", (data) => {
		return [data];
	});
	Schema.extend("never", (data, _, options) => {
		throw new ValidationError(`expected nullable but got ${data}`, options);
	});
	Schema.extend("const", (data, { value }, options) => {
		if ((0, import_cosmokit.deepEqual)(data, value)) return [value];
		throw new ValidationError(`expected ${value} but got ${data}`, options);
	});
	function checkWithinRange(data, meta, description, options, skipMin = false) {
		const { max = Infinity, min = -Infinity } = meta;
		if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
		if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
	}
	__name(checkWithinRange, "checkWithinRange");
	Schema.extend("string", (data, { meta }, options) => {
		if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
		if (meta.pattern) {
			const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
			if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
		}
		checkWithinRange(data.length, meta, "string length", options);
		return [data];
	});
	function decimalShift(data, digits) {
		const str = data.toString();
		if (str.includes("e")) return data * Math.pow(10, digits);
		const index = str.indexOf(".");
		if (index === -1) return data * Math.pow(10, digits);
		const frac = str.slice(index + 1);
		const integer = str.slice(0, index);
		if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
		return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
	}
	__name(decimalShift, "decimalShift");
	function isMultipleOf(data, min, step) {
		step = Math.abs(step);
		if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
		const index = step.toString().indexOf(".");
		const digits = step.toString().slice(index + 1).length;
		return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
	}
	__name(isMultipleOf, "isMultipleOf");
	Schema.extend("number", (data, { meta }, options) => {
		if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
		checkWithinRange(data, meta, "number", options);
		const { step } = meta;
		if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
		return [data];
	});
	Schema.extend("boolean", (data, _, options) => {
		if (typeof data === "boolean") return [data];
		throw new ValidationError(`expected boolean but got ${data}`, options);
	});
	Schema.extend("bitset", (data, { bits, meta }, options) => {
		let value = 0, keys = [];
		if (typeof data === "number") {
			value = data;
			for (const key in bits) if (data & bits[key]) keys.push(key);
		} else if (Array.isArray(data)) {
			keys = data;
			for (const key of keys) {
				if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
				if (key in bits) value |= bits[key];
			}
		} else throw new ValidationError(`expected number or array but got ${data}`, options);
		if (value === meta.default) return [value];
		return [value, keys];
	});
	Schema.extend("function", (data, _, options) => {
		if (typeof data === "function") return [data];
		throw new ValidationError(`expected function but got ${data}`, options);
	});
	Schema.extend("is", (data, { constructor }, options) => {
		if (typeof constructor === "function") {
			if (data instanceof constructor) return [data];
			throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
		} else {
			if ((0, import_cosmokit.isNullable)(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
			let prototype = Object.getPrototypeOf(data);
			while (prototype) {
				if (prototype.constructor?.name === constructor) return [data];
				prototype = Object.getPrototypeOf(prototype);
			}
			throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		}
	});
	function property(data, key, schema, options) {
		try {
			const [value, adapted] = Schema.resolve(data[key], schema, {
				...options,
				path: [...options.path || [], key]
			});
			if (adapted !== void 0) data[key] = adapted;
			return value;
		} catch (e) {
			if (!options?.autofix) throw e;
			delete data[key];
			return schema.meta.default;
		}
	}
	__name(property, "property");
	Schema.extend("array", (data, { inner, meta }, options) => {
		if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
		checkWithinRange(data.length, meta, "array length", options, !(0, import_cosmokit.isNullable)(inner.meta.default));
		return [data.map((_, index) => property(data, index, inner, options))];
	});
	Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
		if (!(0, import_cosmokit.isPlainObject)(data)) throw new ValidationError(`expected object but got ${data}`, options);
		const result = {};
		for (const key in data) {
			let rKey;
			try {
				rKey = Schema.resolve(key, sKey, options)[0];
			} catch (error) {
				if (strict) continue;
				throw error;
			}
			result[rKey] = property(data, key, inner, options);
			data[rKey] = data[key];
			if (key !== rKey) delete data[key];
		}
		return [result];
	});
	Schema.extend("tuple", (data, { list }, options, strict) => {
		if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
		const result = list.map((inner, index) => property(data, index, inner, options));
		if (strict) return [result];
		result.push(...data.slice(list.length));
		return [result];
	});
	function merge(result, data) {
		for (const key in data) {
			if (key in result) continue;
			result[key] = data[key];
		}
	}
	__name(merge, "merge");
	Schema.extend("object", (data, { dict }, options, strict) => {
		if (!(0, import_cosmokit.isPlainObject)(data)) throw new ValidationError(`expected object but got ${data}`, options);
		const result = {};
		for (const key in dict) {
			const value = property(data, key, dict[key], options);
			if (!(0, import_cosmokit.isNullable)(value) || key in data) result[key] = value;
		}
		if (!strict) merge(result, data);
		return [result];
	});
	Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
		const messages = [];
		for (const inner of list) try {
			return Schema.resolve(data, inner, options, strict);
		} catch (error) {
			messages.push(error);
		}
		throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
	});
	Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
		if (!list.length) return [data];
		let result;
		for (const inner of list) {
			const value = Schema.resolve(data, inner, options, true)[0];
			if ((0, import_cosmokit.isNullable)(value)) continue;
			if ((0, import_cosmokit.isNullable)(result)) result = value;
			else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
			else if (typeof value === "object") merge(result ??= {}, value);
			else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
		}
		if (!strict && (0, import_cosmokit.isPlainObject)(data)) merge(result, data);
		return [result];
	});
	Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
		const [result, adapted = data] = Schema.resolve(data, inner, options, true);
		if (preserve) return [callback(result)];
		else return [callback(result), callback(adapted)];
	});
	var formatters = {};
	function defineMethod(name, keys, format) {
		formatters[name] = format;
		Object.assign(Schema, { [name](...args) {
			const schema = new Schema({ type: name });
			keys.forEach((key, index) => {
				switch (key) {
					case "sKey":
						schema.sKey = args[index] ?? Schema.string();
						break;
					case "inner":
						schema.inner = Schema.from(args[index]);
						break;
					case "list":
						schema.list = args[index].map(Schema.from);
						break;
					case "dict":
						schema.dict = (0, import_cosmokit.valueMap)(args[index], Schema.from);
						break;
					case "bits":
						schema.bits = {};
						for (const key2 in args[index]) {
							if (typeof args[index][key2] !== "number") continue;
							schema.bits[key2] = args[index][key2];
						}
						break;
					case "callback": {
						const callback = schema.callback = args[index];
						callback["toJSON"] ||= () => callback.toString();
						break;
					}
					case "constructor": {
						const constructor = schema.constructor = args[index];
						if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
						break;
					}
					default: schema[key] = args[index];
				}
			});
			if (name === "object" || name === "dict") schema.meta.default = {};
			else if (name === "array" || name === "tuple") schema.meta.default = [];
			else if (name === "bitset") schema.meta.default = 0;
			return schema;
		} });
	}
	__name(defineMethod, "defineMethod");
	defineMethod("is", ["constructor"], ({ constructor }) => {
		if (typeof constructor === "function") return constructor.name;
		else return constructor;
	});
	defineMethod("any", [], () => "any");
	defineMethod("never", [], () => "never");
	defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
	defineMethod("string", [], () => "string");
	defineMethod("number", [], () => "number");
	defineMethod("boolean", [], () => "boolean");
	defineMethod("bitset", ["bits"], () => "bitset");
	defineMethod("function", [], () => "function");
	defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
	defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
	defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
	defineMethod("object", ["dict"], ({ dict }) => {
		if (Object.keys(dict).length === 0) return "{}";
		return `{ ${Object.entries(dict).map(([key, inner]) => {
			return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
		}).join(", ")} }`;
	});
	defineMethod("union", ["list"], ({ list }, inline) => {
		const result = list.map(({ toString: format }) => format()).join(" | ");
		return inline ? `(${result})` : result;
	});
	defineMethod("intersect", ["list"], ({ list }) => {
		return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
	});
	defineMethod("transform", [
		"inner",
		"callback",
		"preserve"
	], ({ inner }, isInner) => inner.toString(isInner));
	module.exports = Schema;
})))(), 1);
const RATE_LIMIT_RETRY_BASE_MS = 3e3;
const RATE_LIMIT_CAPACITY_RECOVERY_INTERVAL_MS = 18e4;
const SUSPENDED_REASON = "Provider rate limit; subagent requeued for retry.";
const SUBAGENT_TIMEOUT_MESSAGE = "Subagent timed out.";
/** 重试预算用尽时的文案(T-111)。 */
const ATTEMPTS_EXHAUSTED_MESSAGE = (attempts) => `Subagent exhausted ${attempts} attempts after provider rate limiting.`;
const CANCEL_BATCH_MESSAGE = "The user manually interrupted this subagent batch.";
const CANCEL_STARTED_MESSAGE = "The user manually interrupted this subagent batch before this subagent finished.";
const CANCEL_NOT_STARTED_MESSAGE = "The user manually interrupted this subagent batch before this subagent was started.";
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** setTimeout 的 ms 上限是 2^31-1,超出会溢出(立即触发);钳位后再排。 */
function setClampedTimeout(callback, ms) {
	return setTimeout(callback, Math.min(ms, MAX_TIMEOUT_MS));
}
var SwarmBatch = class {
	launcher;
	states;
	pending;
	results;
	active = /* @__PURE__ */ new Set();
	controller = new AbortController();
	batchSignal;
	batchAbortListener;
	maxConcurrency;
	initialLaunchLimit;
	initialLaunchIntervalMs;
	maxAttempts;
	backoffJitterMs;
	onItemSettled;
	normalLaunchCount = 0;
	normalLaunchTimer;
	rateLimitLaunchTimer;
	resolve;
	finished = false;
	started = false;
	rateLimitMode = false;
	startedSuccessCount = 0;
	/** 测试可见:限流模式下的动态容量。 */
	rateLimitCapacity = 1;
	lastRateLimitAt;
	lastCapacityShrinkAt;
	lastCapacityRecoveryAt;
	globalRetryIntervalMs = RATE_LIMIT_RETRY_BASE_MS;
	nextRateLimitLaunchAt = 0;
	constructor(tasks, launcher, options = {}) {
		this.launcher = launcher;
		this.maxConcurrency = options.maxConcurrency;
		this.initialLaunchLimit = options.initialLaunchLimit ?? 5;
		this.initialLaunchIntervalMs = options.initialLaunchIntervalMs ?? 700;
		if (!Number.isInteger(this.initialLaunchLimit) || this.initialLaunchLimit < 1) throw new Error(`SwarmBatch: initialLaunchLimit must be a positive integer, got ${String(options.initialLaunchLimit)}.`);
		this.maxAttempts = options.maxAttempts;
		this.onItemSettled = options.onItemSettled;
		this.backoffJitterMs = options.rateLimitBackoffJitterMs ?? 0;
		if (!Number.isFinite(this.backoffJitterMs) || this.backoffJitterMs < 0) throw new Error(`SwarmBatch: rateLimitBackoffJitterMs must be a non-negative number, got ${String(options.rateLimitBackoffJitterMs)}.`);
		if (this.maxAttempts !== void 0 && (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1)) throw new Error(`SwarmBatch: maxAttempts must be a positive integer, got ${String(options.maxAttempts)}.`);
		if (!Number.isFinite(this.initialLaunchIntervalMs) || this.initialLaunchIntervalMs < 0) throw new Error(`SwarmBatch: initialLaunchIntervalMs must be a non-negative number, got ${String(options.initialLaunchIntervalMs)}.`);
		this.states = tasks.map((task, index) => ({
			index,
			task,
			retryCount: 0,
			retryReadyAt: 0,
			started: false,
			everLaunched: false,
			throttled: false
		}));
		this.pending = [...this.states];
		this.results = Array.from({ length: tasks.length });
		this.batchSignal = options.signal;
		this.batchAbortListener = () => {
			this.controller.abort(this.batchSignal?.reason);
			this.finishWithUserCancellation();
		};
	}
	run() {
		if (this.started) throw new Error("SwarmBatch.run() can only be called once.");
		this.started = true;
		return new Promise((resolve) => {
			this.resolve = resolve;
			if (this.states.length === 0) {
				this.finish([]);
				return;
			}
			if (this.batchSignal?.aborted === true) {
				this.batchAbortListener();
				return;
			}
			this.batchSignal?.addEventListener("abort", this.batchAbortListener, { once: true });
			this.schedule();
		});
	}
	schedule() {
		if (this.finished) return;
		if (this.finishIfComplete()) return;
		if (this.controller.signal.aborted) return;
		if (this.rateLimitMode) this.scheduleRateLimitLaunch();
		else this.scheduleNormalLaunch();
	}
	scheduleNormalLaunch() {
		while (this.normalLaunchCount < this.initialLaunchLimit && this.pending.length > 0 && !this.rateLimitMode && !this.isAtConcurrencyLimit()) {
			this.startAttempt(this.pending.shift());
			this.normalLaunchCount += 1;
		}
		if (this.pending.length === 0 || this.rateLimitMode || this.normalLaunchTimer !== void 0 || this.isAtConcurrencyLimit()) return;
		this.normalLaunchTimer = setTimeout(() => {
			this.normalLaunchTimer = void 0;
			if (this.finished || this.rateLimitMode || this.pending.length === 0) return;
			if (this.isAtConcurrencyLimit()) return;
			this.startAttempt(this.pending.shift());
			this.normalLaunchCount += 1;
			this.schedule();
		}, this.initialLaunchIntervalMs);
	}
	isAtConcurrencyLimit() {
		return this.maxConcurrency !== void 0 && this.active.size >= this.maxConcurrency;
	}
	scheduleRateLimitLaunch() {
		this.clearRateLimitTimer();
		if (this.pending.length === 0) return;
		const now = Date.now();
		this.recoverRateLimitCapacity(now);
		if (this.active.size >= this.rateLimitCapacity) {
			this.scheduleRateLimitWakeup(this.nextRateLimitCapacityRecoveryAt(), now);
			return;
		}
		const nextAllowedAt = Math.max(this.nextRateLimitLaunchAt, this.nextPendingReadyAt());
		const nextWakeupAt = Math.min(nextAllowedAt, this.nextRateLimitCapacityRecoveryAt());
		if (nextWakeupAt > now) {
			this.scheduleRateLimitWakeup(nextWakeupAt, now);
			return;
		}
		const pendingIndex = this.pending.findIndex((state) => state.retryReadyAt <= now);
		if (pendingIndex === -1) return;
		const [state] = this.pending.splice(pendingIndex, 1);
		this.startAttempt(state);
		this.nextRateLimitLaunchAt = now + this.globalRetryIntervalMs;
		this.scheduleNextRateLimitWakeup(now);
	}
	startAttempt(state) {
		if (this.finished || this.controller.signal.aborted) return;
		const attempt = {
			state,
			controller: new AbortController(),
			cleanup: () => {},
			callbacks: void 0,
			ready: false,
			timedOut: false
		};
		attempt.cleanup = this.linkAttemptSignals(attempt, state.task);
		attempt.callbacks = {
			onReady: () => this.markAttemptReady(attempt),
			onAgent: (agentId) => {
				state.agentId = agentId;
			},
			onComplete: (completion) => {
				if (this.finished || this.controller.signal.aborted || !this.active.has(attempt)) return;
				if (completion.usage !== void 0) state.usage = mergeUsage(state.usage, completion.usage);
				const result = {
					task: state.task,
					status: "completed",
					state: "started",
					result: completion.result,
					...completion.stopReason !== void 0 ? { stopReason: completion.stopReason } : {},
					...state.usage === void 0 ? {} : { usage: state.usage },
					...this.observe(state, Date.now())
				};
				this.handleAttemptOutcome(attempt, {
					kind: "final",
					result
				});
			},
			onError: (error) => {
				if (this.finished || this.controller.signal.aborted || !this.active.has(attempt)) return;
				if (error.rateLimit) {
					const ready = attempt.ready || error.ready === true;
					this.handleAttemptOutcome(attempt, {
						kind: "rate_limited",
						error: this.attemptErrorMessage(attempt, error.message, "failed"),
						ready,
						...error.reason === void 0 ? {} : { reason: error.reason }
					});
				} else this.handleAttemptOutcome(attempt, {
					kind: "final",
					result: this.failedResult(attempt, error.message, error.reason)
				});
			}
		};
		this.active.add(attempt);
		if (state.firstStartedAt === void 0) state.firstStartedAt = Date.now();
		try {
			attempt.controller.signal.throwIfAborted();
			this.launcher.start(state.task, attempt.callbacks, attempt.controller.signal);
			state.everLaunched = true;
		} catch (error) {
			this.handleAttemptOutcome(attempt, {
				kind: "final",
				result: this.failedResult(attempt, error instanceof Error ? error.message : String(error))
			});
		}
	}
	/** 落位一条结果并通知观测钩子(钩子异常不得影响调度)。 */
	storeResult(entry) {
		this.results[entry.task.index] = entry;
		try {
			this.onItemSettled?.(entry);
		} catch {}
	}
	/** 结果条目的可观测字段:尝试次数 / 是否限流挂起过 / 首次启动→落位耗时。 */
	observe(state, now) {
		return {
			attempts: state.retryCount + 1,
			...state.agentId === void 0 ? {} : { agentId: state.agentId },
			...state.throttled ? { throttled: true } : {},
			...state.firstStartedAt === void 0 ? {} : { elapsedMs: now - state.firstStartedAt }
		};
	}
	failedResult(attempt, message, reported) {
		const status = attempt.controller.signal.aborted && !attempt.timedOut ? "aborted" : "failed";
		const reason = attempt.timedOut ? "timeout" : status === "aborted" ? "aborted" : reported ?? "failed";
		return {
			task: attempt.state.task,
			status,
			state: attempt.state.everLaunched ? "started" : "not_started",
			error: this.attemptErrorMessage(attempt, message, status),
			reason,
			...this.observe(attempt.state, Date.now())
		};
	}
	markAttemptReady(attempt) {
		if (this.finished || attempt.ready || !this.active.has(attempt)) return;
		attempt.ready = true;
		attempt.state.started = true;
		if (!this.rateLimitMode) this.startedSuccessCount += 1;
		if (this.rateLimitMode) {
			this.globalRetryIntervalMs = RATE_LIMIT_RETRY_BASE_MS;
			this.nextRateLimitLaunchAt = Date.now() + this.globalRetryIntervalMs;
			this.schedule();
		}
	}
	handleAttemptOutcome(attempt, outcome) {
		if (!this.releaseAttempt(attempt)) return;
		if (this.finished) return;
		if (outcome.kind === "final") this.storeResult(outcome.result);
		else if (this.maxAttempts !== void 0 && attempt.state.retryCount + 1 >= this.maxAttempts) {
			const error = ATTEMPTS_EXHAUSTED_MESSAGE(this.maxAttempts);
			this.launcher.abandoned?.({
				task: attempt.state.task,
				outcome: "failed",
				error
			});
			this.storeResult({
				task: attempt.state.task,
				status: "failed",
				state: "started",
				error,
				reason: attempt.timedOut ? "timeout" : "attempts-exhausted",
				...this.observe(attempt.state, Date.now())
			});
		} else if (this.isOnlyUnfinishedTask(attempt.state)) {
			this.launcher.abandoned?.({
				task: attempt.state.task,
				outcome: "failed",
				error: outcome.error
			});
			this.storeResult({
				task: attempt.state.task,
				status: "failed",
				state: "started",
				error: outcome.error,
				reason: attempt.timedOut ? "timeout" : outcome.reason ?? "deadlock",
				...this.observe(attempt.state, Date.now())
			});
		} else this.requeueRateLimited(attempt, outcome);
		this.schedule();
	}
	releaseAttempt(attempt) {
		if (!this.active.delete(attempt)) return false;
		attempt.cleanup();
		return true;
	}
	requeueRateLimited(attempt, outcome) {
		const state = attempt.state;
		state.throttled = true;
		attempt.callbacks.onSuspended?.({ reason: SUSPENDED_REASON });
		const now = Date.now();
		this.lastRateLimitAt = now;
		state.retryCount += 1;
		const retryDelay = RATE_LIMIT_RETRY_BASE_MS * 2 ** Math.max(0, state.retryCount - 1) + (this.backoffJitterMs > 0 ? Math.floor(Math.random() * (this.backoffJitterMs + 1)) : 0);
		state.retryReadyAt = now + retryDelay;
		this.pending.unshift(state);
		this.enterRateLimitMode(now);
		if (!outcome.ready) {
			this.globalRetryIntervalMs = Math.max(this.globalRetryIntervalMs * 2, retryDelay);
			this.nextRateLimitLaunchAt = Math.max(this.nextRateLimitLaunchAt, now + this.globalRetryIntervalMs);
		} else this.nextRateLimitLaunchAt = Math.max(this.nextRateLimitLaunchAt, now + RATE_LIMIT_RETRY_BASE_MS);
	}
	enterRateLimitMode(now) {
		if (!this.rateLimitMode) {
			this.rateLimitMode = true;
			this.clearNormalTimer();
			this.rateLimitCapacity = Math.max(1, this.startedSuccessCount);
			this.nextRateLimitLaunchAt = Math.max(this.nextRateLimitLaunchAt, now + RATE_LIMIT_RETRY_BASE_MS);
			this.shrinkRateLimitCapacity(now, true);
			return;
		}
		this.shrinkRateLimitCapacity(now, false);
	}
	shrinkRateLimitCapacity(now, force) {
		if (!force && this.lastCapacityShrinkAt !== void 0 && now - this.lastCapacityShrinkAt < 2e3) return;
		this.rateLimitCapacity = Math.max(1, this.rateLimitCapacity - 1);
		this.lastCapacityShrinkAt = now;
	}
	recoverRateLimitCapacity(now) {
		if (this.nextRateLimitCapacityRecoveryAt() > now) return;
		this.rateLimitCapacity += 1;
		this.lastCapacityRecoveryAt = now;
		this.nextRateLimitLaunchAt = Math.min(this.nextRateLimitLaunchAt, now);
	}
	nextRateLimitCapacityRecoveryAt() {
		if (this.pending.length === 0 || this.lastRateLimitAt === void 0) return Number.POSITIVE_INFINITY;
		return Math.max(this.lastRateLimitAt, this.lastCapacityRecoveryAt ?? 0) + RATE_LIMIT_CAPACITY_RECOVERY_INTERVAL_MS;
	}
	scheduleRateLimitWakeup(wakeupAt, now) {
		if (!Number.isFinite(wakeupAt) || wakeupAt <= now) return;
		this.rateLimitLaunchTimer = setTimeout(() => {
			this.rateLimitLaunchTimer = void 0;
			this.schedule();
		}, wakeupAt - now);
	}
	scheduleNextRateLimitWakeup(now) {
		if (this.pending.length === 0) return;
		const nextWakeupAt = this.active.size >= this.rateLimitCapacity ? this.nextRateLimitCapacityRecoveryAt() : Math.min(Math.max(this.nextRateLimitLaunchAt, this.nextPendingReadyAt()), this.nextRateLimitCapacityRecoveryAt());
		this.scheduleRateLimitWakeup(nextWakeupAt, now);
	}
	nextPendingReadyAt() {
		return this.pending.reduce((nextAt, state) => Math.min(nextAt, state.retryReadyAt), Number.POSITIVE_INFINITY);
	}
	finishIfComplete() {
		if (this.results.every((result) => result !== void 0)) {
			this.finish(this.results);
			return true;
		}
		return false;
	}
	isOnlyUnfinishedTask(state) {
		return this.results.every((result, index) => index === state.index || result !== void 0);
	}
	finishWithUserCancellation() {
		if (this.finished) return;
		this.abandonSuspended();
		this.finish(this.states.map((state) => {
			const result = this.results[state.index];
			if (result !== void 0) return result;
			if (state.started || state.everLaunched) return {
				task: state.task,
				status: "aborted",
				state: "started",
				error: CANCEL_STARTED_MESSAGE,
				...this.observe(state, Date.now())
			};
			return {
				task: state.task,
				status: "aborted",
				state: "not_started",
				error: CANCEL_NOT_STARTED_MESSAGE
			};
		}));
	}
	finish(results) {
		if (this.finished) return;
		this.finished = true;
		this.cleanup();
		this.resolve?.(results);
	}
	abandonSuspended() {
		for (const state of this.pending) {
			if (!state.everLaunched) continue;
			this.launcher.abandoned?.({
				task: state.task,
				outcome: "cancelled"
			});
		}
		for (const attempt of this.active) {
			if (attempt.ready) continue;
			if (!attempt.state.everLaunched) continue;
			this.launcher.abandoned?.({
				task: attempt.state.task,
				outcome: "cancelled"
			});
		}
	}
	cleanup() {
		this.batchSignal?.removeEventListener("abort", this.batchAbortListener);
		this.clearNormalTimer();
		this.clearRateLimitTimer();
		for (const attempt of this.active.values()) attempt.cleanup();
		this.active.clear();
	}
	clearNormalTimer() {
		if (this.normalLaunchTimer !== void 0) clearTimeout(this.normalLaunchTimer);
		this.normalLaunchTimer = void 0;
	}
	clearRateLimitTimer() {
		if (this.rateLimitLaunchTimer !== void 0) clearTimeout(this.rateLimitLaunchTimer);
		this.rateLimitLaunchTimer = void 0;
	}
	linkAttemptSignals(attempt, task) {
		const abortFromBatch = () => {
			attempt.controller.abort(this.controller.signal.reason);
		};
		const timeout = task.timeoutMs === void 0 || task.timeoutMs <= 0 ? void 0 : setClampedTimeout(() => {
			attempt.timedOut = true;
			attempt.controller.abort(/* @__PURE__ */ new Error(SUBAGENT_TIMEOUT_MESSAGE));
		}, task.timeoutMs);
		if (this.controller.signal.aborted) abortFromBatch();
		else this.controller.signal.addEventListener("abort", abortFromBatch, { once: true });
		return () => {
			if (timeout !== void 0) clearTimeout(timeout);
			this.controller.signal.removeEventListener("abort", abortFromBatch);
		};
	}
	/** 错误文案优先级:超时 > 取消 > 原始错误。 */
	attemptErrorMessage(attempt, message, status) {
		if (attempt.timedOut && attempt.state.task.timeoutMs !== void 0) return SUBAGENT_TIMEOUT_MESSAGE;
		if (status === "aborted") return CANCEL_BATCH_MESSAGE;
		return message;
	}
};
/**
* 合并两次用量(T-129 起为**唯一实现**,launcher 与调度器共用,避免逻辑分叉):
* 字段相加;totalTokens 缺省时按该次 input+output 兜底;两侧都没有 totalTokens 则结果也不带该字段。
*/
function mergeUsage(previous, next) {
	const merged = {
		inputTokens: (previous?.inputTokens ?? 0) + next.inputTokens,
		outputTokens: (previous?.outputTokens ?? 0) + next.outputTokens
	};
	const totalPrevious = previous?.totalTokens;
	const totalNext = next.totalTokens;
	if (totalPrevious !== void 0 || totalNext !== void 0) merged.totalTokens = (totalPrevious ?? (previous?.inputTokens ?? 0) + (previous?.outputTokens ?? 0)) + (totalNext ?? next.inputTokens + next.outputTokens);
	return merged;
}
function runSwarmBatch(tasks, launcher, options = {}) {
	return new SwarmBatch(tasks, launcher, options).run();
}
//#endregion
//#region src/launcher-llm.ts
/**
* 子代理执行层 · 路径 A(T-004)— 用宿主 \`llm.stream\` 跑单个子任务(一期子任务无工具)。
*
* 契约见 项目文档/03-模块文档-子代理执行层.md;调度器 launcher 接口见 src/scheduler.ts。
*
* 与宿主的耦合方式:不 import \`@deepseek-ai/dsh-llm\`,而是按结构化(鸭子类型)声明其
* 流协议 —— 字段名取自该包 0.1.5-rc.3 的类型声明(\`StreamChunk\`/\`LlmFailure\`/\`GenerateOptions\`)
* 并与 dsh-llm-verifier 的生产用法交叉核对。理由与风险见模块文档「宿主契约的耦合方式」。
*
* 宿主协议要点(已核实):
* - \`stream(options: GenerateOptions): AsyncIterable<StreamChunk>\`;文本经 \`text-delta\` 增量下发,
*   也可能只在 \`block-end\` 带整块文本(两种都要吃)。
* - 适配器抛出的失败会被 \`LlmRuntime.stream\` 归一化成终态 \`finish\` 块
*   (\`kind:'error'|'aborted'\` + \`failure:{message, code, status?}\`),而不是抛给调用方;同步抛仍可能出现。
* - 限流用稳定码 \`RATE_LIMIT\`;账号配额 \`QUOTA\`。判定表见模块文档 §5。
*/
const PLUGIN_NAME = "dsh-agent-swarm";
const EMPTY_RESULT_MESSAGE = "Subagent completed without a final message.";
const MAX_TOKENS_MESSAGE = "Subagent response reached the max token limit before completing.";
/** 默认可重排队(挂起重试)的稳定码:限流与配额。 */
const DEFAULT_RETRYABLE_FAILURE_CODES = Object.freeze(["RATE_LIMIT", "QUOTA"]);
/** 文案兜底特征:只在拿不到结构化码/状态时使用(保守,避免把普通错误当限流无限重排队)。 */
const RATE_LIMIT_MESSAGE = /rate[ _-]?limit|too many requests|\b429\b|quota|overloaded|限流|配额/i;
/**
* 判定一个失败是否属于“限流/配额”。
*
* 只有拿到**明确证据**才返回 true(稳定码 RATE_LIMIT/QUOTA、HTTP 429、或保守的限流文案特征);
* 其余一律 false —— 按非限流判 failed(见模块文档 §3 警告:反向误判代价更高)。
* 会沿 \`cause\` 链与 \`response.status\` 找证据,最多 3 层。
*/
/**
* 从调用方 agent 读出它当前使用的路由(宿主 dsh-agent 的 AgentOptions: { provider?, model? })。
* Config 未显式指定时可用它让子任务跟随会话模型;形状不符返回 undefined(不猜字段名)。
*/
/** 读取宿主 usage chunk 的用量(字段名取自宿主 TokenUsage;形状不符返回 undefined,不猜)。 */
function readUsage(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const raw = value;
	const input = typeof raw.inputTokens === "number" && Number.isFinite(raw.inputTokens) ? raw.inputTokens : void 0;
	const output = typeof raw.outputTokens === "number" && Number.isFinite(raw.outputTokens) ? raw.outputTokens : void 0;
	if (input === void 0 && output === void 0) return void 0;
	const total = typeof raw.totalTokens === "number" && Number.isFinite(raw.totalTokens) ? raw.totalTokens : void 0;
	return {
		inputTokens: input ?? 0,
		outputTokens: output ?? 0,
		...total === void 0 ? {} : { totalTokens: total }
	};
}
function resolveAgentRoute(agent) {
	const options = agent?.options;
	if (options === void 0 || options === null || typeof options !== "object") return void 0;
	const provider = options.provider;
	const model = options.model;
	if (typeof provider !== "string" || provider.trim() === "") return void 0;
	if (typeof model !== "string" || model.trim() === "") return void 0;
	return {
		provider,
		model
	};
}
/**
* 判定一个失败是否应“挂起重排队”。除 \`codes\` 给出的稳定码外,HTTP 429 与保守文案特征
* 始终算数(它们是 provider 侧的直接证据,与码表无关)。
*/
function isRetryableFailure(value, codes) {
	return inspectFailure(value, 0, new Set(codes.map((code) => code.toUpperCase())));
}
function inspectFailure(value, depth, codes) {
	if (depth > 3 || value === null || value === void 0) return false;
	if (typeof value !== "object") return false;
	const record = value;
	const code = typeof record.code === "string" ? record.code.toUpperCase() : void 0;
	if (code !== void 0 && codes.has(code)) return true;
	for (const status of [
		record.status,
		record.statusCode,
		record.response?.status
	]) if (status === 429) return true;
	if (typeof record.message === "string" && RATE_LIMIT_MESSAGE.test(record.message)) return true;
	return inspectFailure(record.cause, depth + 1, codes);
}
/**
* 聚合 \`StreamChunk\`:\`text-delta\` 权威;某 index 没有 delta 时才回退 \`block-end\` 的整块文本
* (两种下发风格都不丢正文、也不重复累加)。未知块类型忽略(协议可扩展)。
*/
function createTextCollector() {
	const parts = [];
	const deltaIndexes = /* @__PURE__ */ new Set();
	let reason = { kind: "stop" };
	return {
		push(chunk) {
			switch (chunk.type) {
				case "text-delta":
					deltaIndexes.add(chunk.index);
					parts.push(chunk.text);
					return;
				case "block-end":
					if (chunk.block.type === "text" && !deltaIndexes.has(chunk.index) && typeof chunk.block.text === "string") parts.push(chunk.block.text);
					return;
				case "finish":
					reason = chunk.reason;
					return;
				default: return;
			}
		},
		result() {
			return {
				text: parts.join(""),
				reason
			};
		}
	};
}
/** 子任务消息:plugin 来源的 user 消息(宿主 Message 结构,id 由本插件铸造)。 */
function createSubagentMessage(prompt) {
	return {
		id: randomUUID(),
		role: "user",
		content: [{
			type: "text",
			text: prompt
		}],
		source: {
			kind: "plugin",
			plugin: PLUGIN_NAME
		}
	};
}
function messageOf$2(value) {
	if (value instanceof Error) return value.message;
	if (typeof value === "object" && value !== null && typeof value.message === "string") return value.message;
	return String(value);
}
/**
* 造一个调度器 launcher:每个子任务 = 一次 \`llm.stream\` 调用。
*
* - 首个请求发出前 \`onReady\`(调度器据此分流限流重/轻罚);
* - 正常收尾取聚合文本(trim)作结果;空结论、max-tokens 截断按 failed 上报;
* - 限流/配额 → \`onError({rateLimit:true, ready:true})\`,由调度器挂起重排队;
* - 任务 signal(取消/超时)传导到在途请求;\`abandoned\` 释放该任务的句柄。
*/
function createLlmLauncher(options) {
	const inFlight = /* @__PURE__ */ new Map();
	const systemPrompt = options.systemPrompt ?? "你是 dsh agent_swarm 派发的子代理,只负责完成用户消息里的这一项子任务。直接给出结论或结果,不要寒暄、不要追问、不要调用工具。";
	const retryableCodes = options.retryableFailureCodes ?? DEFAULT_RETRYABLE_FAILURE_CODES;
	if (!Array.isArray(retryableCodes) || retryableCodes.length === 0 || retryableCodes.some((code) => typeof code !== "string" || code.trim() === "")) throw new Error("agent_swarm retryableFailureCodes must be a non-empty array of non-empty strings.");
	const isRetryable = (value) => isRetryableFailure(value, retryableCodes);
	function buildOptions(task, signal) {
		return {
			provider: options.provider,
			model: options.model,
			system: systemPrompt,
			messages: [createSubagentMessage(task.prompt)],
			...options.maxTokens === void 0 ? {} : { maxTokens: options.maxTokens },
			...options.temperature === void 0 ? {} : { temperature: options.temperature },
			signal
		};
	}
	async function runAttempt(task, callbacks, controller) {
		let stream;
		try {
			stream = options.llm.stream(buildOptions(task, controller.signal));
		} catch (error) {
			callbacks.onError({
				message: messageOf$2(error),
				rateLimit: isRetryable(error),
				ready: false,
				reason: "provider-error"
			});
			return;
		}
		callbacks.onReady();
		const collector = createTextCollector();
		let usage;
		try {
			for await (const chunk of stream) {
				collector.push(chunk);
				if (chunk.type === "usage") {
					const read = readUsage(chunk.usage);
					if (read !== void 0) usage = mergeUsage(usage, read);
				}
			}
		} catch (error) {
			callbacks.onError({
				message: messageOf$2(error),
				rateLimit: isRetryable(error),
				ready: true,
				reason: "provider-error"
			});
			return;
		}
		const { text, reason } = collector.result();
		const trimmed = text.trim();
		const failure = reason.failure;
		switch (reason.kind) {
			case "stop":
				if (trimmed.length === 0) {
					callbacks.onError({
						message: EMPTY_RESULT_MESSAGE,
						rateLimit: false,
						ready: true,
						reason: "empty-output"
					});
					return;
				}
				callbacks.onComplete({
					result: trimmed,
					...usage === void 0 ? {} : { usage }
				});
				return;
			case "max-tokens":
				callbacks.onError({
					message: MAX_TOKENS_MESSAGE,
					rateLimit: false,
					ready: true,
					reason: "max-tokens"
				});
				return;
			case "aborted":
				callbacks.onError({
					message: failure?.message ?? "Subagent run was aborted.",
					rateLimit: false,
					ready: true,
					reason: "aborted"
				});
				return;
			case "error":
				callbacks.onError({
					message: failure?.message ?? "Subagent failed without a message.",
					rateLimit: isRetryable(failure),
					ready: true,
					reason: "provider-error"
				});
				return;
			default:
				if (trimmed.length > 0) {
					callbacks.onComplete({
						result: trimmed,
						stopReason: reason.kind,
						...usage === void 0 ? {} : { usage }
					});
					return;
				}
				callbacks.onError({
					message: failure?.message ?? "Subagent completed without a final message.",
					rateLimit: false,
					ready: true,
					reason: "empty-output"
				});
				return;
		}
	}
	return {
		start(task, callbacks, signal) {
			const controller = new AbortController();
			inFlight.set(task.index, controller);
			const abortFromTask = () => controller.abort(signal.reason);
			if (signal.aborted) abortFromTask();
			else signal.addEventListener("abort", abortFromTask, { once: true });
			let released = false;
			const release = () => {
				if (released) return;
				released = true;
				signal.removeEventListener("abort", abortFromTask);
				if (inFlight.get(task.index) === controller) inFlight.delete(task.index);
			};
			callbacks.onSuspended = () => release();
			runAttempt(task, callbacks, controller).catch((error) => {
				try {
					callbacks.onError({
						message: messageOf$2(error),
						rateLimit: false,
						ready: true,
						reason: "provider-error"
					});
				} catch {}
			}).finally(release);
		},
		abandoned(info) {
			const controller = inFlight.get(info.task.index);
			if (controller === void 0) return;
			inFlight.delete(info.task.index);
			controller.abort();
		}
	};
}
//#endregion
//#region src/render.ts
const FENCE_CHAR = "`";
const SWARM_HEADER_PREFIX = "agent_swarm: ";
const UNKNOWN_BODY = "unknown error";
const RETRY_HINT = "Not all subagent runs completed; agent_swarm is one-shot in this version — re-invoke it with the remaining items to retry.";
/** 正文围栏:比正文内最长反引号串长 1(下限 3),保证正文无法提前闭合围栏。 */
function fenceFor(body) {
	let longest = 0;
	let run = 0;
	for (const char of body) if (char === FENCE_CHAR) {
		run += 1;
		if (run > longest) longest = run;
	} else run = 0;
	return FENCE_CHAR.repeat(Math.max(3, longest + 1));
}
/** 元数据行内的自由文本压成单行:换行/制表符折叠为空格,避免撑破逐条结构。 */
function oneLine(value) {
	return value.replace(/\s+/g, " ").trim();
}
function stringifyBody(value) {
	if (typeof value === "string") return value;
	if (value === void 0 || value === null) return UNKNOWN_BODY;
	try {
		const json = JSON.stringify(value, null, 2);
		return json === void 0 ? String(value) : json;
	} catch {
		return String(value);
	}
}
function bodyOf(result) {
	return stringifyBody(result.status === "completed" ? result.result : result.error);
}
/** 单条正文的截断结果:body = 保留正文(含截断标记),omitted = 省略字符数(0 = 未截断)。 */
/**
* 按 UTF-16 码元截断,但**不切碎代理对**(T-133):若切点落在 emoji 等代理对中间,回退一位。
* 否则会留下孤代理 → 非法文本,可能污染 JSON 与渲染。
*/
function sliceAtCodePoint(text, limit) {
	if (limit <= 0) return "";
	if (text.length <= limit) return text;
	const last = text.charCodeAt(limit - 1);
	const next = text.charCodeAt(limit);
	const splitsPair = last >= 55296 && last <= 56319 && next >= 56320 && next <= 57343;
	return text.slice(0, splitsPair ? limit - 1 : limit);
}
function truncateBody(body, maxBodyChars) {
	if (maxBodyChars === void 0 || !Number.isFinite(maxBodyChars) || maxBodyChars <= 0) return {
		body,
		omitted: 0
	};
	if (body.length <= maxBodyChars) return {
		body,
		omitted: 0
	};
	const kept = sliceAtCodePoint(body, maxBodyChars);
	const omitted = body.length - kept.length;
	return {
		body: `${kept}\n… [truncated: ${omitted} chars omitted]`,
		omitted
	};
}
/**
* 单条结果的元数据行(进度日志与汇总共用同一函数,保证两处逐字一致)。
* 顺序:base → stop_reason → attempts(>1) → throttled → elapsedMs → truncated。
*/
function formatResultLine(result) {
	const parts = [
		`[#${result.task.index + 1}]`,
		`item=${oneLine(result.task.item)}`,
		`state=${result.state}`,
		`outcome=${result.status}`
	];
	if (result.reason !== void 0) parts.push(`reason=${result.reason}`);
	if (result.task.resumeAgentId !== void 0) parts.push("resumed=true");
	if (result.stopReason !== void 0) parts.push(`stop_reason=${oneLine(result.stopReason)}`);
	if (result.attempts !== void 0 && result.attempts > 1) parts.push(`attempts=${result.attempts}`);
	if (result.throttled === true) parts.push("throttled=true");
	if (result.elapsedMs !== void 0) parts.push(`elapsedMs=${result.elapsedMs}`);
	if (result.agentId !== void 0) parts.push(`agent=${oneLine(result.agentId)}`);
	return parts.join(" ");
}
function renderSwarmResults(results, options = {}) {
	const counts = {
		completed: 0,
		failed: 0,
		aborted: 0
	};
	for (const result of results) counts[result.status] += 1;
	const summary = [
		"completed",
		"failed",
		"aborted"
	].filter((status) => counts[status] > 0).map((status) => `${status}: ${counts[status]}`);
	const lines = [`${SWARM_HEADER_PREFIX}${results.length} items — ${summary.length > 0 ? summary.join(", ") : "completed: 0"}`, ""];
	for (const result of results) {
		const { body, omitted } = truncateBody(bodyOf(result), options.maxBodyChars);
		const line = formatResultLine(result);
		const fence = fenceFor(body);
		lines.push(omitted > 0 ? line + " truncated=" + omitted : line);
		lines.push(`${fence}text`);
		lines.push(body);
		lines.push(fence);
	}
	if (results.some((result) => result.status !== "completed")) {
		lines.push("");
		lines.push(RETRY_HINT);
	}
	return lines.join("\n");
}
function swarmResultValue(results, text, options = {}) {
	const counts = {
		completed: 0,
		failed: 0,
		aborted: 0
	};
	const items = [];
	for (const result of results) {
		counts[result.status] += 1;
		const { body, omitted } = truncateBody(bodyOf(result), options.maxBodyChars);
		items.push({
			index: result.task.index,
			item: result.task.item,
			state: result.state,
			outcome: result.status,
			body,
			...result.reason === void 0 ? {} : { reason: result.reason },
			...result.usage === void 0 ? {} : { usage: result.usage },
			...result.stopReason === void 0 ? {} : { stopReason: result.stopReason },
			...result.attempts === void 0 ? {} : { attempts: result.attempts },
			...result.throttled === true ? { throttled: true } : {},
			...result.elapsedMs === void 0 ? {} : { elapsedMs: result.elapsedMs },
			...result.agentId === void 0 ? {} : { agentId: result.agentId },
			...result.task.resumeAgentId === void 0 ? {} : { resumed: true },
			...omitted > 0 ? { truncated: omitted } : {}
		});
	}
	let usage;
	let sawTotal = false;
	for (const item of items) {
		if (item.usage === void 0) continue;
		const itemTotal = item.usage.totalTokens;
		if (itemTotal !== void 0) sawTotal = true;
		const nextUsage = {
			inputTokens: (usage?.inputTokens ?? 0) + item.usage.inputTokens,
			outputTokens: (usage?.outputTokens ?? 0) + item.usage.outputTokens
		};
		if (sawTotal) nextUsage.totalTokens = (usage?.totalTokens ?? (usage === void 0 ? 0 : usage.inputTokens + usage.outputTokens)) + (itemTotal ?? item.usage.inputTokens + item.usage.outputTokens);
		usage = nextUsage;
	}
	return {
		text,
		counts,
		items,
		...usage === void 0 ? {} : { usage }
	};
}
/**
* 在**调用点**解析 subagent 服务。插件自己的 ctx 看不到兄弟作用域注册的服务
* (cordis 对未 inject 的服务属性访问会直接抛错),而工具 exec 带来的 agent 有自己的作用域
* ctx(宿主 Agent.ctx),在那里 get('subagents') 才拿得到。取不到就回退 fallback。
*/
function resolveSubagentService(agent, fallback) {
	const agentCtx = agent?.ctx;
	try {
		const found = agentCtx?.get?.("subagents");
		if (found !== void 0 && found !== null) return found;
	} catch {}
	return fallback;
}
function messageOf$1(value) {
	if (value instanceof Error) return value.message;
	if (typeof value === "object" && value !== null && typeof value.message === "string") return value.message;
	return String(value);
}
function textOf(output) {
	return output.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("").trim();
}
/**
* 造一个走宿主 subagent 的 launcher。语义与路径 A 对齐(ready/complete/error/abandoned),
* 因此调度器完全无需改动。
*/
function createSubagentLauncher(options) {
	if (typeof options.provider !== "string" || options.provider.trim() === "") throw new Error("agent_swarm subagentProvider must be a non-empty provider name.");
	const codes = options.retryableFailureCodes ?? DEFAULT_RETRYABLE_FAILURE_CODES;
	const inFlight = /* @__PURE__ */ new Map();
	const disposed = /* @__PURE__ */ new Set();
	const release = (run) => {
		if (disposed.has(run)) return;
		disposed.add(run);
		try {
			run.dispose();
		} catch {}
	};
	const settle = (callbacks, result, run) => {
		release(run);
		const diagnostic = result.diagnostic;
		switch (result.stopReason) {
			case "completed": {
				const text = textOf(result.output);
				if (text === "") {
					callbacks.onError({
						message: EMPTY_RESULT_MESSAGE,
						rateLimit: false,
						ready: true
					});
					return;
				}
				callbacks.onComplete({
					result: text,
					stopReason: "completed"
				});
				return;
			}
			case "aborted":
				callbacks.onError({
					message: diagnostic ?? "Subagent run was aborted.",
					rateLimit: false,
					ready: true
				});
				return;
			case "max-tokens":
				callbacks.onError({
					message: diagnostic ?? "Subagent response reached the max token limit before completing.",
					rateLimit: false,
					ready: true
				});
				return;
			case "refusal":
				callbacks.onError({
					message: diagnostic ?? "Subagent declined the task.",
					rateLimit: false,
					ready: true
				});
				return;
			default:
				callbacks.onError({
					message: diagnostic ?? "Subagent failed without a diagnostic.",
					rateLimit: isRetryableFailure(typeof diagnostic === "string" ? { message: diagnostic } : void 0, codes),
					ready: true
				});
				return;
		}
	};
	async function runAttempt(task, callbacks, signal) {
		let run;
		try {
			run = await options.subagents.start(options.provider, {
				prompt: [{
					type: "text",
					text: task.prompt
				}],
				parent: options.parent,
				signal,
				label: sliceAtCodePoint(task.item, 60),
				...options.agentOptions === void 0 ? {} : { agentOptions: options.agentOptions }
			});
		} catch (error) {
			callbacks.onError({
				message: messageOf$1(error),
				rateLimit: isRetryableFailure(error, codes),
				ready: false
			});
			return;
		}
		inFlight.set(task.index, run);
		callbacks.onAgent?.(run.id);
		callbacks.onReady();
		let result;
		try {
			result = await run.result;
		} catch (error) {
			release(run);
			callbacks.onError({
				message: messageOf$1(error),
				rateLimit: isRetryableFailure(error, codes),
				ready: true
			});
			return;
		} finally {
			if (inFlight.get(task.index) === run) inFlight.delete(task.index);
		}
		settle(callbacks, result, run);
	}
	return {
		start(task, callbacks, signal) {
			runAttempt(task, callbacks, signal).catch((error) => {
				try {
					callbacks.onError({
						message: messageOf$1(error),
						rateLimit: false,
						ready: true
					});
				} catch {}
			});
		},
		abandoned(info) {
			const run = inFlight.get(info.task.index);
			if (run === void 0) return;
			inFlight.delete(info.task.index);
			release(run);
		}
	};
}
//#endregion
//#region src/launcher-continuable.ts
/**
* 子代理执行层 · 可续跑路径(T-103)— 子级是**可继续子会话**(durable),因此没有 `result` Promise:
* - 新建:`ctx.subagents.startContinuable({ provider, label, request, signal })` → `{ childId }`
* - 续跑:`ctx.subagents.sendMessage(parent, childId, content, { signal })`(同一子会话接新一轮)
* - 取结果:轮询 `agents.get(childId).status === 'idle'` 判该轮结束 → `sessions.readSession(childId)`
*   取最后一条非空 `assistant/message` 的 `data.message.content`(字符串或分片数组)
* - `abandoned` 只 `interrupt`,**绝不 dispose**(dispose 会毁掉可续跑的会话)
*
* 事实出处(宿主类型声明 + 运行时探针):`AgentStatus = 'idle'|'running'`(dsh-agent runtime-types L90);
* `readSession → { session, inheritedEventCount, events }`(dsh-session-query L74/L34);
* `assistant/message` 正文在 `data.message.content`(T-103 探针实测)。
*/
const SUBAGENT_TURN_TIMEOUT_MESSAGE = "Subagent turn did not finish in time.";
function messageOf(value) {
	if (value instanceof Error) return value.message;
	if (typeof value === "object" && value !== null && typeof value.message === "string") return value.message;
	return String(value);
}
/** 把 assistant 消息的 content(字符串或分片数组)归一化成纯文本。 */
function normalizeAssistantContent(content) {
	if (typeof content === "string") return content.trim();
	if (Array.isArray(content)) return content.map((part) => {
		if (typeof part === "string") return part;
		const text = part?.text;
		return typeof text === "string" ? text : "";
	}).join("").trim();
	return "";
}
function delay(ms, signal) {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener("abort", () => {
			clearTimeout(timer);
			resolve();
		}, { once: true });
	});
}
/** 在调用点从 agent 作用域取宿主服务(cordis 不允许插件直接访问未 inject 的服务)。 */
function resolveHostService(agent, name) {
	const agentCtx = agent?.ctx;
	try {
		return agentCtx?.get?.(name) ?? void 0;
	} catch {
		return;
	}
}
function createContinuableSubagentLauncher(options) {
	if (typeof options.provider !== "string" || options.provider.trim() === "") throw new Error("agent_swarm subagentProvider must be a non-empty provider name.");
	const pollIntervalMs = options.pollIntervalMs ?? 500;
	const turnTimeoutMs = options.turnTimeoutMs ?? 6e5;
	const inFlight = /* @__PURE__ */ new Map();
	const abandoned = /* @__PURE__ */ new Set();
	async function readAssistant(childId) {
		const snapshot = await options.sessions.readSession(childId);
		const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
		let text = "";
		let lastSeq = -1;
		for (const event of events) {
			if (event?.type !== "assistant/message") continue;
			const normalized = normalizeAssistantContent(event.data?.message?.content);
			if (normalized === "") continue;
			text = normalized;
			lastSeq = typeof event.seq === "number" ? event.seq : lastSeq;
		}
		return {
			text,
			lastSeq
		};
	}
	async function waitForTurn(childId, baselineSeq, signal, taskIndex) {
		const deadline = turnTimeoutMs > 0 ? Date.now() + turnTimeoutMs : Number.POSITIVE_INFINITY;
		for (;;) {
			if (signal.aborted || abandoned.has(taskIndex)) return null;
			const status = options.agents?.get(childId)?.status;
			if (status === void 0 || status === "idle") {
				const { text, lastSeq } = await readAssistant(childId);
				if (lastSeq > baselineSeq) return text;
			}
			if (Date.now() >= deadline) return null;
			await delay(pollIntervalMs, signal);
		}
	}
	async function run(task, callbacks, signal) {
		let childId;
		let baselineSeq = -1;
		const prompt = [{
			type: "text",
			text: task.prompt
		}];
		try {
			if (task.resumeAgentId !== void 0) {
				childId = task.resumeAgentId;
				baselineSeq = (await readAssistant(childId)).lastSeq;
				await options.subagents.sendMessage(options.parent, childId, prompt, { signal });
			} else childId = (await options.subagents.startContinuable({
				provider: options.provider,
				label: sliceAtCodePoint(task.item, 60),
				request: {
					prompt,
					parent: options.parent,
					...options.agentOptions === void 0 ? {} : { agentOptions: options.agentOptions }
				},
				signal
			})).childId;
		} catch (error) {
			callbacks.onError({
				message: messageOf(error),
				rateLimit: false,
				ready: false
			});
			return;
		}
		inFlight.set(task.index, childId);
		callbacks.onAgent?.(childId);
		callbacks.onReady();
		const text = await waitForTurn(childId, baselineSeq, signal, task.index);
		if (inFlight.get(task.index) === childId) inFlight.delete(task.index);
		if (abandoned.has(task.index)) return;
		if (text === null) {
			callbacks.onError({
				message: SUBAGENT_TURN_TIMEOUT_MESSAGE,
				rateLimit: false,
				ready: true
			});
			return;
		}
		if (text === "") {
			callbacks.onError({
				message: EMPTY_RESULT_MESSAGE,
				rateLimit: false,
				ready: true
			});
			return;
		}
		callbacks.onComplete({
			result: text,
			stopReason: "completed"
		});
	}
	return {
		start(task, callbacks, signal) {
			run(task, callbacks, signal).catch((error) => {
				try {
					callbacks.onError({
						message: messageOf(error),
						rateLimit: false,
						ready: true
					});
				} catch {}
			});
		},
		abandoned(info) {
			const childId = inFlight.get(info.task.index);
			abandoned.add(info.task.index);
			inFlight.delete(info.task.index);
			if (childId === void 0) return;
			try {
				options.subagents.interrupt?.(childId, {
					kind: "ancestor",
					agent: options.parent
				});
			} catch {}
		}
	};
}
const ITEM_PLACEHOLDER = "{{item}}";
/** 内置变量:当前条目的 1-based 序位 / 条目总数(T-126)。 */
const INDEX_PLACEHOLDER = "{{index}}";
const TOTAL_PLACEHOLDER = "{{total}}";
/** 对象条目的字段占位符:{{item.<key>}}(key 限字母/数字/下划线/连字符)。 */
const ITEM_FIELD_PLACEHOLDER = /\{\{item\.([A-Za-z0-9_-]+)\}\}/;
const ITEM_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const ERRORS = {
	tooFewItems: "agent_swarm requires at least 2 items.",
	tooManyItems: "agent_swarm supports at most 128 subagents.",
	missingTemplate: "agent_swarm requires a prompt_template when items are provided.",
	missingPlaceholder: "agent_swarm prompt_template must include the {{item}} placeholder.",
	duplicatePrompts: (a, b) => `Duplicate subagent prompts from items ${a} and ${b}. agent_swarm requires distinct subagents.`,
	blankItem: (n) => `agent_swarm items must not contain blank entries (item ${n} is blank).`,
	promptTooLong: (limit, length, n) => `agent_swarm expanded prompt exceeds ${limit} characters (got ${length}) for item ${n}.`,
	invalidResumeAgent: (n) => `agent_swarm item ${n} has an "agent" field that is not a non-empty child session id.`,
	invalidItem: (n) => `agent_swarm items must be strings or flat objects of string/number fields (item ${n} is invalid).`,
	missingField: (key, n) => `agent_swarm prompt_template references {{item.${key}}} but item ${n} has no such field.`,
	fieldPlaceholderOnStringItem: (key, n) => `agent_swarm prompt_template uses {{item.${key}}} but item ${n} is a string; pass an object item with that field.`
};
/** 校验对象条目形状:非空、键名合法、值只能是 string 或有限 number。 */
function assertValidItemObject(item, n) {
	if (typeof item !== "object" || item === null || Array.isArray(item)) throw new Error(ERRORS.invalidItem(n));
	const entries = Object.entries(item);
	if (entries.length === 0) throw new Error(ERRORS.invalidItem(n));
	for (const [key, value] of entries) {
		if (!ITEM_KEY_PATTERN.test(key)) throw new Error(ERRORS.invalidItem(n));
		if (key === "agent") {
			if (typeof value !== "string" || value.trim() === "") throw new Error(ERRORS.invalidResumeAgent(n));
			continue;
		}
		if (typeof value === "string") continue;
		if (typeof value === "number" && Number.isFinite(value)) continue;
		throw new Error(ERRORS.invalidItem(n));
	}
}
/**
* 展开单条 item:字符串走 {{item}} 全局替换;对象先替换 {{item.<key>}} 字段占位符,
* 剩下的 {{item.<key>}} 视为缺字段直接报错(fail fast,不静默留占位符),
* 最后把 {{item}} 替换为该对象的 JSON。
*/
function expandItem(template, item, index, total) {
	const withBuiltins = template.split(INDEX_PLACEHOLDER).join(String(index + 1)).split(TOTAL_PLACEHOLDER).join(String(total));
	if (typeof item === "string") {
		const fieldOnString = ITEM_FIELD_PLACEHOLDER.exec(withBuiltins);
		if (fieldOnString !== null) throw new Error(ERRORS.fieldPlaceholderOnStringItem(fieldOnString[1], index + 1));
		return withBuiltins.split(ITEM_PLACEHOLDER).join(item);
	}
	let expanded = withBuiltins;
	for (const [key, value] of Object.entries(item)) expanded = expanded.split(`{{item.${key}}}`).join(String(value));
	const leftover = ITEM_FIELD_PLACEHOLDER.exec(expanded);
	if (leftover !== null) throw new Error(ERRORS.missingField(leftover[1], index + 1));
	return expanded.split(ITEM_PLACEHOLDER).join(JSON.stringify(item));
}
function createSwarmSpecs(args, options = {}) {
	const items = args.items;
	if (!items.some((item) => typeof item === "object" && item !== null && !Array.isArray(item) && typeof item.agent === "string" && item.agent.trim() !== "") && items.length < 2) throw new Error(ERRORS.tooFewItems);
	if (items.length > 128) throw new Error(ERRORS.tooManyItems);
	for (const [index, item] of items.entries()) {
		if (typeof item === "string") {
			if (item.trim() === "") throw new Error(ERRORS.blankItem(index + 1));
			continue;
		}
		assertValidItemObject(item, index + 1);
	}
	const template = args.prompt_template;
	if (!template) throw new Error(ERRORS.missingTemplate);
	if (!template.includes("{{item}}") && !ITEM_FIELD_PLACEHOLDER.test(template)) throw new Error(ERRORS.missingPlaceholder);
	const prompts = items.map((item, index) => expandItem(template, item, index, items.length));
	const seen = /* @__PURE__ */ new Map();
	for (const [index, prompt] of prompts.entries()) {
		const item = items[index];
		const key = (typeof item === "object" && item !== null && typeof item.agent === "string" ? item.agent : "") + "\n" + prompt;
		const previous = seen.get(key);
		if (previous !== void 0) throw new Error(ERRORS.duplicatePrompts(previous + 1, index + 1));
		seen.set(key, index);
	}
	if (options.maxPromptChars !== void 0) {
		for (const [index, prompt] of prompts.entries()) if (prompt.length > options.maxPromptChars) throw new Error(ERRORS.promptTooLong(options.maxPromptChars, prompt.length, index + 1));
	}
	return items.map((item, index) => ({
		index,
		item: typeof item === "string" ? item : JSON.stringify(item),
		prompt: prompts[index],
		description: `${args.description} #${index + 1}`,
		...typeof item === "string" || typeof item.agent !== "string" ? {} : { resumeAgentId: item.agent }
	}));
}
//#endregion
//#region src/tool.ts
/**
* 工具入口(T-006)— 注册 \`agent_swarm\` 并编排一次批量调用:校验 → 调度 → 渲染。
*
* 契约见 项目文档/03-模块文档-工具入口.md。宿主 \`ctx.tools.register\` 接受
* \`{name, description, parameters, output:{schema, render}, execute, timeoutMs?}\`;
* 这里手写等价 definition(**不 import \`@deepseek-ai/dsh-tools\`**,同 T-004 的取舍),
* 失败靠 execute 抛出、宿主 materialize 成 isError。
*
* 注意:宿主 parameters 只接受 JSON Schema 子集(object/array/scalar/enum/oneOf),
* **不支持 minItems/maxItems** —— 2~128 的上限由 src/specs.ts 的校验承担。
*/
const AGENT_SWARM_TOOL_NAME = "agent_swarm";
const DESCRIPTION_RESUME = "Items may carry a reserved \"agent\" field naming an existing child session: that item CONTINUES that child instead of starting a new one, and the summary marks it resumed=true. ";
/** 路径 A(默认)的工具描述。 */
const AGENT_SWARM_DESCRIPTION = "Fan one prompt template out over 2-128 items as a batch of parallel one-shot subagents and return a single summarized result block. Use it PROACTIVELY - the user does not need to name it - whenever the same kind of independent work applies to several inputs at once (triage, review, summarize, classify, rewrite or compare N files/sections/topics/rows), or when a cheap first pass should decide what deserves expensive follow-up. Each subagent is a one-shot LLM call with NO tools, no file access and no follow-up: everything it needs must be in the template (which must contain {{item}}), so ask for a short fixed-field answer. Do NOT use it for work that needs tools, file edits, multi-round verification, or for items that depend on each other - hand those to the agent-team subagent tools (spawn_teammate/send_message/team_task_*) instead, optionally after using this tool to triage. Rate-limit aware: 429/quota failures are requeued with backoff instead of failing. Invalid arguments start nothing.";
/** 按实际执行路径生成工具描述(路径 A 逐字不变;路径 B 换成带工具的文案,续跑再补 agent 键说明)。 */
function agentSwarmDescription(options = {}) {
	if (options.subagent !== true) return AGENT_SWARM_DESCRIPTION;
	return "Fan one prompt template out over 2-128 items as a batch of parallel host subagents and return a single summarized result block. Use it PROACTIVELY - the user does not need to name it - whenever the same kind of independent work applies to several inputs at once (triage, review, summarize, classify, rewrite or compare N files/sections/topics/rows), or when a cheap first pass should decide what deserves expensive follow-up. Each subagent is a full host subagent WITH tools: it can read files, run commands and take several steps, so a template may ask it to investigate {{item}} itself - still ask for a short, fixed-field answer. " + (options.continuable === true ? DESCRIPTION_RESUME : "") + "Prefer this over hand-spawning subagents when the same kind of work repeats over several inputs. Do NOT use it for items that depend on each other, or for edits you must keep mutually consistent - hand those to the agent-team tools (spawn_teammate/send_message/team_task_*) instead. Rate-limit aware: 429/quota failures are requeued with backoff instead of failing. Invalid arguments start nothing.";
}
const AGENT_SWARM_PARAMETERS = {
	type: "object",
	additionalProperties: false,
	properties: {
		description: {
			type: "string",
			description: "Short label for the whole batch; it labels every subagent of this call."
		},
		prompt_template: {
			type: "string",
			description: "Prompt template applied to every item. Must reference the item: either {{item}} or a field placeholder {{item.<key>}} (object items). Built-ins: {{index}} (1-based position) and {{total}} (item count)."
		},
		items: {
			type: "array",
			items: { oneOf: [{ type: "string" }, { type: "object" }] },
			description: "One entry per subagent: 2-128 distinct entries. Each entry is either a string (used as {{item}}) or a flat object whose values are strings or numbers (fields are available as {{item.<key>}}, e.g. {\"path\":\"src/a.ts\",\"focus\":\"perf\"}). A reserved key \"agent\" names an existing child session id: that entry CONTINUES that child instead of starting a new one."
		}
	},
	required: ["description", "items"]
};
/**
* 输出契约:对象根(宿主要求 structured output 是 object-rooted),上层可直接取字段
* (counts/items[].index|outcome|agentId|resumed…),不必正则解析文本。
* `text` 承载人类可读汇总(与用户看到的逐字一致),render 只读它 —— 格式逻辑只有一份,不会漂移。
*/
const AGENT_SWARM_OUTPUT = {
	schema: {
		type: "object",
		additionalProperties: false,
		required: [
			"text",
			"counts",
			"items"
		],
		properties: {
			text: {
				type: "string",
				description: "Human-readable summary; identical to what the user sees."
			},
			usage: {
				type: "object",
				additionalProperties: false,
				required: ["inputTokens", "outputTokens"],
				description: "Batch token totals (sum over every item and every attempt); absent when the provider reports no usage.",
				properties: {
					inputTokens: { type: "integer" },
					outputTokens: { type: "integer" },
					totalTokens: { type: "integer" }
				}
			},
			counts: {
				type: "object",
				additionalProperties: false,
				required: [
					"completed",
					"failed",
					"aborted"
				],
				properties: {
					completed: { type: "integer" },
					failed: { type: "integer" },
					aborted: { type: "integer" }
				}
			},
			items: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: [
						"index",
						"item",
						"state",
						"outcome",
						"body"
					],
					properties: {
						index: { type: "integer" },
						item: { type: "string" },
						state: { type: "string" },
						outcome: {
							type: "string",
							description: "completed | failed | aborted"
						},
						body: { type: "string" },
						reason: {
							type: "string",
							description: "Failure cause: timeout | empty-output | provider-error | attempts-exhausted | deadlock | aborted."
						},
						usage: {
							type: "object",
							additionalProperties: false,
							required: ["inputTokens", "outputTokens"],
							description: "Token usage for this item, summed over its attempts.",
							properties: {
								inputTokens: { type: "integer" },
								outputTokens: { type: "integer" },
								totalTokens: { type: "integer" }
							}
						},
						stopReason: { type: "string" },
						attempts: { type: "integer" },
						throttled: { type: "boolean" },
						elapsedMs: { type: "integer" },
						agentId: {
							type: "string",
							description: "Subagent session id (path B); use it as an item `agent` key to resume."
						},
						resumed: { type: "boolean" },
						truncated: { type: "integer" }
					}
				}
			}
		}
	},
	render: (_args, value) => {
		const text = value?.text;
		return [{
			type: "text",
			text: typeof text === "string" ? text : String(value)
		}];
	}
};
function cleanError(error) {
	return error instanceof Error ? error : new Error(String(error));
}
/** 结构校验:非对象/类型错在启动任何子任务之前就拒绝,文案面向模型可读。 */
function parseArgs(args) {
	if (typeof args !== "object" || args === null || Array.isArray(args)) throw new Error("agent_swarm arguments must be an object.");
	const { description, prompt_template: template, items } = args;
	if (typeof description !== "string" || description.trim() === "") throw new Error("agent_swarm requires a non-empty description.");
	if (!Array.isArray(items) || !items.every((item) => typeof item === "string" || typeof item === "object" && item !== null && !Array.isArray(item))) throw new Error("agent_swarm requires items to be an array of strings or flat objects.");
	if (template !== void 0 && typeof template !== "string") throw new Error("agent_swarm requires prompt_template to be a string.");
	return {
		description,
		...template === void 0 ? {} : { prompt_template: template },
		items: [...items]
	};
}
/**
* 造 \`agent_swarm\` 工具 definition。
*
* 一次调用 = 校验展开(零启动保证)→ 组装 tasks(0-based index、Config 超时)→
* 调度器跑批(exec.signal 即批取消信号)→ 渲染汇总文本。
*/
function createAgentSwarmTool(deps) {
	if (deps.maxBodyChars !== void 0 && (!Number.isInteger(deps.maxBodyChars) || deps.maxBodyChars < 1)) throw new Error("agent_swarm maxBodyChars must be a positive integer when set.");
	if (deps.rampLimit !== void 0 && (!Number.isInteger(deps.rampLimit) || deps.rampLimit < 1)) throw new Error("agent_swarm rampLimit must be a positive integer when set.");
	if (deps.rampIntervalMs !== void 0 && (!Number.isFinite(deps.rampIntervalMs) || deps.rampIntervalMs < 0)) throw new Error("agent_swarm rampIntervalMs must be a non-negative number when set.");
	if (deps.maxPromptChars !== void 0 && (!Number.isInteger(deps.maxPromptChars) || deps.maxPromptChars < 1)) throw new Error("agent_swarm maxPromptChars must be a positive integer when set.");
	if (deps.maxAttempts !== void 0 && (!Number.isInteger(deps.maxAttempts) || deps.maxAttempts < 1)) throw new Error("agent_swarm maxAttempts must be a positive integer when set.");
	return {
		name: AGENT_SWARM_TOOL_NAME,
		description: deps.description ?? "Fan one prompt template out over 2-128 items as a batch of parallel one-shot subagents and return a single summarized result block. Use it PROACTIVELY - the user does not need to name it - whenever the same kind of independent work applies to several inputs at once (triage, review, summarize, classify, rewrite or compare N files/sections/topics/rows), or when a cheap first pass should decide what deserves expensive follow-up. Each subagent is a one-shot LLM call with NO tools, no file access and no follow-up: everything it needs must be in the template (which must contain {{item}}), so ask for a short fixed-field answer. Do NOT use it for work that needs tools, file edits, multi-round verification, or for items that depend on each other - hand those to the agent-team subagent tools (spawn_teammate/send_message/team_task_*) instead, optionally after using this tool to triage. Rate-limit aware: 429/quota failures are requeued with backoff instead of failing. Invalid arguments start nothing.",
		parameters: AGENT_SWARM_PARAMETERS,
		output: AGENT_SWARM_OUTPUT,
		timeoutMs: deps.toolTimeoutMs ?? 144e5,
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const specs = createSwarmSpecs(parseArgs(args), { ...deps.maxPromptChars === void 0 ? {} : { maxPromptChars: deps.maxPromptChars } });
			let launcher;
			try {
				launcher = deps.createLauncher(exec ?? {});
			} catch (error) {
				throw cleanError(error);
			}
			const tasks = specs.map((spec) => ({
				index: spec.index,
				item: spec.item,
				prompt: spec.prompt,
				...spec.resumeAgentId === void 0 ? {} : { resumeAgentId: spec.resumeAgentId },
				...deps.timeoutMs > 0 ? { timeoutMs: deps.timeoutMs } : {}
			}));
			deps.onBatchStart?.({
				count: tasks.length,
				...deps.rampLimit === void 0 ? {} : { rampLimit: deps.rampLimit },
				...deps.rampIntervalMs === void 0 ? {} : { rampIntervalMs: deps.rampIntervalMs },
				timeoutMs: deps.timeoutMs
			});
			try {
				const results = await runSwarmBatch(tasks, launcher, {
					...deps.maxConcurrency === void 0 ? {} : { maxConcurrency: deps.maxConcurrency },
					...deps.rampLimit === void 0 ? {} : { initialLaunchLimit: deps.rampLimit },
					...deps.rampIntervalMs === void 0 ? {} : { initialLaunchIntervalMs: deps.rampIntervalMs },
					...deps.maxAttempts === void 0 ? {} : { maxAttempts: deps.maxAttempts },
					...deps.onItemSettled === void 0 ? {} : { onItemSettled: deps.onItemSettled },
					...exec?.signal === void 0 ? {} : { signal: exec.signal }
				});
				return swarmResultValue(results, renderSwarmResults(results, { ...deps.maxBodyChars === void 0 ? {} : { maxBodyChars: deps.maxBodyChars } }), { ...deps.maxBodyChars === void 0 ? {} : { maxBodyChars: deps.maxBodyChars } });
			} catch (error) {
				throw cleanError(error);
			}
		}
	};
}
//#endregion
//#region src/index.ts
const name = "dsh-agent-swarm";
/** 只依赖工具注册表与 llm 服务;两者都在宿主 base 层。 */
const inject = ["tools", "llm"];
const Config = import_lib.default.object({
	maxConcurrency: import_lib.default.number().min(1),
	timeoutMs: import_lib.default.number().min(0).default(72e5),
	provider: import_lib.default.string().default("deepseek-official"),
	model: import_lib.default.string().default("deepseek-flash"),
	maxTokens: import_lib.default.number().min(1),
	maxBodyChars: import_lib.default.number().min(1),
	rampLimit: import_lib.default.number().min(1),
	rampIntervalMs: import_lib.default.number().min(0),
	retryableFailureCodes: import_lib.default.array(import_lib.default.string()).default(["RATE_LIMIT", "QUOTA"]),
	maxPromptChars: import_lib.default.number().min(1),
	maxAttempts: import_lib.default.number().min(1),
	backoffJitterMs: import_lib.default.number().min(0),
	toolTimeoutMs: import_lib.default.number().min(1),
	systemPrompt: import_lib.default.string(),
	progressLog: import_lib.default.boolean().default(false),
	subagentProvider: import_lib.default.string(),
	followSessionModel: import_lib.default.boolean().default(false),
	resumeEnabled: import_lib.default.boolean().default(false),
	subagentAgentOptions: import_lib.default.boolean().default(false),
	subagentTurnTimeoutMs: import_lib.default.number().min(0),
	subagentPollIntervalMs: import_lib.default.number().min(1)
});
function apply(ctx, config) {
	const app = ctx;
	const subagents = ctx.get?.("subagents");
	ctx.effect(() => {
		const tool = createAgentSwarmTool({
			createLauncher: (exec) => {
				const subagentService = resolveSubagentService(exec.agent, subagents);
				const useSubagent = (config.subagentProvider ?? "").trim() !== "";
				if (useSubagent && subagentService === void 0) throw new Error("agent_swarm subagentProvider is set but the subagents service is unavailable in this scope.");
				const sessionRoute = config.followSessionModel === true ? resolveAgentRoute(exec.agent) : void 0;
				const provider = sessionRoute?.provider ?? config.provider;
				const model = sessionRoute?.model ?? config.model;
				const agentOptions = config.subagentAgentOptions === true ? {
					provider,
					model,
					...config.maxTokens === void 0 ? {} : { maxTokens: config.maxTokens }
				} : void 0;
				const turnTimeoutMs = config.subagentTurnTimeoutMs ?? config.timeoutMs;
				const pollIntervalMs = config.subagentPollIntervalMs;
				const retryCodes = config.retryableFailureCodes === void 0 || config.retryableFailureCodes.length === 0 ? {} : { retryableFailureCodes: config.retryableFailureCodes };
				if (useSubagent && config.resumeEnabled === true) {
					const sessions = resolveHostService(exec.agent, "sessionQuery");
					if (sessions === void 0) throw new Error("agent_swarm resumeEnabled is set but ctx.sessionQuery is unavailable in this scope.");
					const agentLookup = resolveHostService(exec.agent, "agents");
					return createContinuableSubagentLauncher({
						subagents: subagentService,
						sessions,
						...agentLookup === void 0 ? {} : { agents: agentLookup },
						provider: config.subagentProvider,
						parent: exec.agent,
						turnTimeoutMs,
						...pollIntervalMs === void 0 ? {} : { pollIntervalMs },
						...agentOptions === void 0 ? {} : { agentOptions }
					});
				}
				return useSubagent ? createSubagentLauncher({
					subagents: subagentService,
					provider: config.subagentProvider,
					parent: exec.agent,
					...agentOptions === void 0 ? {} : { agentOptions },
					...retryCodes
				}) : createLlmLauncher({
					llm: app.llm,
					provider,
					model,
					...config.maxTokens === void 0 ? {} : { maxTokens: config.maxTokens },
					...retryCodes,
					...config.systemPrompt === void 0 ? {} : { systemPrompt: config.systemPrompt }
				});
			},
			...config.maxConcurrency === void 0 ? {} : { maxConcurrency: config.maxConcurrency },
			...config.maxBodyChars === void 0 ? {} : { maxBodyChars: config.maxBodyChars },
			...config.rampLimit === void 0 ? {} : { rampLimit: config.rampLimit },
			...config.rampIntervalMs === void 0 ? {} : { rampIntervalMs: config.rampIntervalMs },
			...config.maxPromptChars === void 0 ? {} : { maxPromptChars: config.maxPromptChars },
			...config.maxAttempts === void 0 ? {} : { maxAttempts: config.maxAttempts },
			...config.backoffJitterMs === void 0 ? {} : { rateLimitBackoffJitterMs: config.backoffJitterMs },
			...config.toolTimeoutMs === void 0 ? {} : { toolTimeoutMs: config.toolTimeoutMs },
			...config.progressLog === true ? {
				onBatchStart: (info) => {
					ctx.logger?.info?.(`[dsh-agent-swarm] starting ${info.count} subtasks (first wave ${info.rampLimit ?? 5}, +1 every ${info.rampIntervalMs ?? 700}ms, per-task timeout ${info.timeoutMs}ms)`, {
						count: info.count,
						rampLimit: info.rampLimit,
						rampIntervalMs: info.rampIntervalMs,
						timeoutMs: info.timeoutMs
					});
				},
				onItemSettled: (entry) => {
					const settled = entry;
					ctx.logger?.info?.("[dsh-agent-swarm] " + formatResultLine(settled), {
						index: settled.task.index,
						outcome: settled.status,
						state: settled.state,
						...settled.attempts === void 0 ? {} : { attempts: settled.attempts },
						...settled.throttled === true ? { throttled: true } : {},
						...settled.elapsedMs === void 0 ? {} : { elapsedMs: settled.elapsedMs },
						...settled.agentId === void 0 ? {} : { agentId: settled.agentId },
						...settled.task.resumeAgentId === void 0 ? {} : { resumed: true }
					});
				}
			} : {},
			description: agentSwarmDescription({
				subagent: (config.subagentProvider ?? "").trim() !== "",
				continuable: config.resumeEnabled === true
			}),
			timeoutMs: config.timeoutMs
		});
		const dispose = app.tools.register(tool);
		ctx.logger?.info?.(`[dsh-agent-swarm] registered tool "${tool.name}" (provider=${config.provider}, model=${config.model}, maxConcurrency=${config.maxConcurrency ?? "unlimited"}, timeoutMs=${config.timeoutMs})`);
		return () => {
			try {
				dispose();
			} catch {}
		};
	});
}
//#endregion
export { Config, apply, inject, name };

//# sourceMappingURL=index.js.map