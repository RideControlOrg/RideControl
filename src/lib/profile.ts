import { indexedDbRequestResult, indexedDbTransactionComplete } from './indexed-db';
import { isFiniteNumber, isRecord, isString } from './type-guards';

const DATABASE_NAME = 'ridecontrol-profile';
const DATABASE_VERSION = 1;
const PROFILE_ID = 'current';
const PROFILE_STORE = 'profile';
const SINGLE_BIKE_PROFILE_VERSION = 1;
const MULTI_BIKE_PROFILE_VERSION = 2;
const PROFILE_VERSION = 3;
const BIKE_PURCHASE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TEETH_SEPARATOR = /[\s,/]+/u;

export const DEFAULT_RIDER_WEIGHT_KG = 75;
export const DEFAULT_BIKE_WEIGHT_KG = 9;
export const KILOGRAMS_PER_POUND = 0.453_592_37;
export const MINIMUM_RIDER_WEIGHT_KG = 20;
export const MAXIMUM_RIDER_WEIGHT_KG = 350;
export const MINIMUM_BIKE_WEIGHT_KG = 2;
export const MAXIMUM_BIKE_WEIGHT_KG = 80;
export const MAXIMUM_BIKE_NAME_LENGTH = 100;
export const MAXIMUM_BIKE_MANUFACTURER_LENGTH = 100;
export const MAXIMUM_BIKE_MODEL_LENGTH = 100;
export const MAXIMUM_BIKE_COLOR_LENGTH = 100;
export const MAXIMUM_PROFILE_BIKES = 20;
export const MAXIMUM_PROFILE_NAME_LENGTH = 100;
export const MAXIMUM_PROFILE_IDENTITY_LENGTH = 100;
export const MAXIMUM_VIRTUAL_GEARS = 24;
export const MINIMUM_DRIVETRAIN_TEETH = 5;
export const MAXIMUM_DRIVETRAIN_TEETH = 100;
export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PROFILE_IMAGE_ACCEPT = PROFILE_IMAGE_TYPES.join(',');
export const DEFAULT_FRONT_CHAINRING_TEETH = [53, 39] as const;
export const DEFAULT_REAR_CASSETTE_TEETH = [
	12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24,
] as const;

export const PROFILE_IDENTITY_SUGGESTIONS = [
	'Woman',
	'Man',
	'Non-binary',
	'Agender',
	'Genderfluid',
	'Genderqueer',
	'Intersex',
	'Questioning',
	'Two-Spirit',
	'Prefer not to say',
] as const;

export interface VirtualDrivetrain {
	frontChainringTeeth: readonly number[];
	rearCassetteTeeth: readonly number[];
}

export interface ProfileBike extends VirtualDrivetrain {
	color?: string;
	id: string;
	image?: Blob;
	manufacturer?: string;
	model?: string;
	name: string;
	purchasedOn?: string;
	weightKg: number;
}

export interface RiderPhysicsProfile extends VirtualDrivetrain {
	bikeId?: string;
	bikeName?: string;
	bikeWeightKg: number;
	riderWeightKg: number;
}

export interface RiderWeightEntry {
	recordedAt: number;
	weightKg: number;
}

export interface RiderProfile {
	activeBikeId: string;
	bikes: readonly ProfileBike[];
	identity: string;
	image?: Blob;
	name: string;
	riderWeightKg: number;
	weightHistory: readonly RiderWeightEntry[];
}

interface StoredRiderProfile extends RiderProfile {
	id: typeof PROFILE_ID;
	updatedAt: number;
	version: typeof PROFILE_VERSION;
}

export const DEFAULT_PROFILE_BIKE: ProfileBike = {
	frontChainringTeeth: DEFAULT_FRONT_CHAINRING_TEETH,
	id: 'default-bike',
	name: 'My bike',
	rearCassetteTeeth: DEFAULT_REAR_CASSETTE_TEETH,
	weightKg: DEFAULT_BIKE_WEIGHT_KG,
};

export const DEFAULT_RIDER_PROFILE: RiderProfile = {
	activeBikeId: DEFAULT_PROFILE_BIKE.id,
	bikes: [DEFAULT_PROFILE_BIKE],
	identity: '',
	name: '',
	riderWeightKg: DEFAULT_RIDER_WEIGHT_KG,
	weightHistory: [],
};

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
	if (databasePromise) {
		return databasePromise;
	}
	databasePromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.addEventListener(
			'upgradeneeded',
			() => {
				if (!request.result.objectStoreNames.contains(PROFILE_STORE)) {
					request.result.createObjectStore(PROFILE_STORE, { keyPath: 'id' });
				}
			},
			{ once: true }
		);
		request.addEventListener('success', () => resolve(request.result), { once: true });
		request.addEventListener('error', () => reject(request.error), { once: true });
	});
	return databasePromise;
}

function numericArray(value: unknown): number[] | undefined {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.some(
			(item) =>
				!(
					isFiniteNumber(item) &&
					Number.isInteger(item) &&
					item >= MINIMUM_DRIVETRAIN_TEETH &&
					item <= MAXIMUM_DRIVETRAIN_TEETH
				)
		) ||
		new Set(value).size !== value.length
	) {
		return;
	}
	return value;
}

function isProfileImage(value: unknown): value is Blob {
	return value instanceof Blob && PROFILE_IMAGE_TYPES.some((type) => type === value.type);
}

function validOptionalBikeText(value: unknown, maximumLength: number): boolean {
	return value === undefined || (isString(value) && value.length <= maximumLength);
}

function riderWeightEntryFromStoredValue(value: unknown): RiderWeightEntry | undefined {
	if (
		!(
			isRecord(value) &&
			isFiniteNumber(value.recordedAt) &&
			value.recordedAt >= 0 &&
			isFiniteNumber(value.weightKg) &&
			value.weightKg >= MINIMUM_RIDER_WEIGHT_KG &&
			value.weightKg <= MAXIMUM_RIDER_WEIGHT_KG
		)
	) {
		return;
	}
	return {
		recordedAt: value.recordedAt,
		weightKg: value.weightKg,
	};
}

function riderWeightHistoryFromStoredValue(value: unknown): RiderWeightEntry[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.flatMap((entry) => {
			const restored = riderWeightEntryFromStoredValue(entry);
			return restored ? [restored] : [];
		})
		.sort((left, right) => left.recordedAt - right.recordedAt);
}

function migratedRiderWeightHistory(
	value: Record<string, unknown>,
	weightKg: number
): RiderWeightEntry[] {
	return isFiniteNumber(value.updatedAt) && value.updatedAt >= 0
		? [{ recordedAt: value.updatedAt, weightKg }]
		: [];
}

export function recordRiderWeight(
	history: readonly RiderWeightEntry[],
	weightKg: number,
	recordedAt: number
): readonly RiderWeightEntry[] {
	if (history.at(-1)?.weightKg === weightKg) {
		return history;
	}
	return [...history, { recordedAt, weightKg }];
}

export function validBikePurchaseDate(value: string): boolean {
	const match = BIKE_PURCHASE_DATE.exec(value);
	if (!match) {
		return false;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

function profileBikeFromStoredValue(value: unknown): ProfileBike | undefined {
	if (!isRecord(value)) {
		return;
	}
	const frontChainringTeeth = numericArray(value.frontChainringTeeth);
	const rearCassetteTeeth = numericArray(value.rearCassetteTeeth);
	if (
		!(
			isString(value.id) &&
			value.id.length > 0 &&
			isString(value.name) &&
			value.name.trim().length > 0 &&
			value.name.length <= MAXIMUM_BIKE_NAME_LENGTH &&
			validOptionalBikeText(value.manufacturer, MAXIMUM_BIKE_MANUFACTURER_LENGTH) &&
			validOptionalBikeText(value.model, MAXIMUM_BIKE_MODEL_LENGTH) &&
			validOptionalBikeText(value.color, MAXIMUM_BIKE_COLOR_LENGTH) &&
			(value.purchasedOn === undefined ||
				(isString(value.purchasedOn) && validBikePurchaseDate(value.purchasedOn))) &&
			(value.image === undefined || isProfileImage(value.image)) &&
			isFiniteNumber(value.weightKg) &&
			frontChainringTeeth &&
			rearCassetteTeeth
		) ||
		value.weightKg < MINIMUM_BIKE_WEIGHT_KG ||
		value.weightKg > MAXIMUM_BIKE_WEIGHT_KG ||
		frontChainringTeeth.length > 3 ||
		frontChainringTeeth.length * rearCassetteTeeth.length > MAXIMUM_VIRTUAL_GEARS
	) {
		return;
	}
	return {
		...(isString(value.color) && value.color.trim() ? { color: value.color.trim() } : {}),
		frontChainringTeeth,
		id: value.id,
		...(isProfileImage(value.image) ? { image: value.image } : {}),
		...(isString(value.manufacturer) && value.manufacturer.trim()
			? { manufacturer: value.manufacturer.trim() }
			: {}),
		...(isString(value.model) && value.model.trim() ? { model: value.model.trim() } : {}),
		name: value.name.trim(),
		...(isString(value.purchasedOn) && value.purchasedOn
			? { purchasedOn: value.purchasedOn }
			: {}),
		rearCassetteTeeth,
		weightKg: value.weightKg,
	};
}

export function riderPhysicsProfileFromStoredValue(
	value: unknown
): RiderPhysicsProfile | undefined {
	if (!isRecord(value)) {
		return;
	}
	const frontChainringTeeth = numericArray(value.frontChainringTeeth);
	const rearCassetteTeeth = numericArray(value.rearCassetteTeeth);
	if (
		!(
			isFiniteNumber(value.riderWeightKg) &&
			isFiniteNumber(value.bikeWeightKg) &&
			frontChainringTeeth &&
			rearCassetteTeeth
		) ||
		value.riderWeightKg < MINIMUM_RIDER_WEIGHT_KG ||
		value.riderWeightKg > MAXIMUM_RIDER_WEIGHT_KG ||
		value.bikeWeightKg < MINIMUM_BIKE_WEIGHT_KG ||
		value.bikeWeightKg > MAXIMUM_BIKE_WEIGHT_KG ||
		frontChainringTeeth.length > 3 ||
		frontChainringTeeth.length * rearCassetteTeeth.length > MAXIMUM_VIRTUAL_GEARS
	) {
		return;
	}
	return {
		bikeId: isString(value.bikeId) && value.bikeId ? value.bikeId : undefined,
		bikeName: isString(value.bikeName) && value.bikeName ? value.bikeName : undefined,
		bikeWeightKg: value.bikeWeightKg,
		frontChainringTeeth,
		rearCassetteTeeth,
		riderWeightKg: value.riderWeightKg,
	};
}

export function snapshotRiderPhysicsProfile(profile: RiderPhysicsProfile): RiderPhysicsProfile {
	return {
		bikeId: profile.bikeId,
		bikeName: profile.bikeName,
		bikeWeightKg: profile.bikeWeightKg,
		frontChainringTeeth: [...profile.frontChainringTeeth],
		rearCassetteTeeth: [...profile.rearCassetteTeeth],
		riderWeightKg: profile.riderWeightKg,
	};
}

export function sameRiderPhysicsProfile(
	left: RiderPhysicsProfile | undefined,
	right: RiderPhysicsProfile
): boolean {
	return (
		left?.bikeId === right.bikeId &&
		left?.bikeName === right.bikeName &&
		left?.bikeWeightKg === right.bikeWeightKg &&
		left?.riderWeightKg === right.riderWeightKg &&
		left?.frontChainringTeeth.length === right.frontChainringTeeth.length &&
		left?.rearCassetteTeeth.length === right.rearCassetteTeeth.length &&
		left?.frontChainringTeeth.every(
			(tooth, index) => tooth === right.frontChainringTeeth[index]
		) &&
		left?.rearCassetteTeeth.every((tooth, index) => tooth === right.rearCassetteTeeth[index])
	);
}

export function profileFromStoredValue(value: unknown): RiderProfile | undefined {
	if (!isRecord(value)) {
		return;
	}
	if (value.version === SINGLE_BIKE_PROFILE_VERSION) {
		const legacyPhysicsProfile = riderPhysicsProfileFromStoredValue(value);
		if (
			!(
				legacyPhysicsProfile &&
				isString(value.name) &&
				isString(value.identity) &&
				value.name.length <= MAXIMUM_PROFILE_NAME_LENGTH &&
				value.identity.length <= MAXIMUM_PROFILE_IDENTITY_LENGTH
			)
		) {
			return;
		}
		const image = isProfileImage(value.image) ? value.image : undefined;
		const migratedBike: ProfileBike = {
			frontChainringTeeth: legacyPhysicsProfile.frontChainringTeeth,
			id: DEFAULT_PROFILE_BIKE.id,
			name: DEFAULT_PROFILE_BIKE.name,
			rearCassetteTeeth: legacyPhysicsProfile.rearCassetteTeeth,
			weightKg: legacyPhysicsProfile.bikeWeightKg,
		};
		return {
			activeBikeId: migratedBike.id,
			bikes: [migratedBike],
			identity: value.identity,
			image,
			name: value.name,
			riderWeightKg: legacyPhysicsProfile.riderWeightKg,
			weightHistory: migratedRiderWeightHistory(value, legacyPhysicsProfile.riderWeightKg),
		};
	}
	if (!(value.version === MULTI_BIKE_PROFILE_VERSION || value.version === PROFILE_VERSION)) {
		return;
	}
	const bikes = Array.isArray(value.bikes)
		? value.bikes.map(profileBikeFromStoredValue)
		: undefined;
	if (
		!(
			bikes &&
			bikes.length > 0 &&
			bikes.length <= MAXIMUM_PROFILE_BIKES &&
			bikes.every((bike): bike is ProfileBike => bike !== undefined) &&
			new Set(bikes.map((bike) => bike.id)).size === bikes.length &&
			isString(value.activeBikeId) &&
			bikes.some((bike) => bike.id === value.activeBikeId) &&
			isFiniteNumber(value.riderWeightKg) &&
			value.riderWeightKg >= MINIMUM_RIDER_WEIGHT_KG &&
			value.riderWeightKg <= MAXIMUM_RIDER_WEIGHT_KG &&
			isString(value.name) &&
			isString(value.identity) &&
			value.name.length <= MAXIMUM_PROFILE_NAME_LENGTH &&
			value.identity.length <= MAXIMUM_PROFILE_IDENTITY_LENGTH
		)
	) {
		return;
	}
	const image = isProfileImage(value.image) ? value.image : undefined;
	return {
		activeBikeId: value.activeBikeId,
		bikes,
		identity: value.identity,
		image,
		name: value.name,
		riderWeightKg: value.riderWeightKg,
		weightHistory:
			value.version === PROFILE_VERSION
				? riderWeightHistoryFromStoredValue(value.weightHistory)
				: migratedRiderWeightHistory(value, value.riderWeightKg),
	};
}

export async function loadRiderProfile(): Promise<RiderProfile> {
	const database = await openDatabase();
	const transaction = database.transaction(PROFILE_STORE, 'readonly');
	const completed = indexedDbTransactionComplete(transaction);
	const value: unknown = await indexedDbRequestResult(
		transaction.objectStore(PROFILE_STORE).get(PROFILE_ID)
	);
	await completed;
	const profile = profileFromStoredValue(value) ?? DEFAULT_RIDER_PROFILE;
	if (
		isRecord(value) &&
		(value.version === SINGLE_BIKE_PROFILE_VERSION ||
			value.version === MULTI_BIKE_PROFILE_VERSION)
	) {
		return saveRiderProfile(profile);
	}
	return profile;
}

export async function saveRiderProfile(
	profile: RiderProfile,
	updatedAt = Date.now()
): Promise<RiderProfile> {
	const database = await openDatabase();
	const transaction = database.transaction(PROFILE_STORE, 'readwrite');
	const completed = indexedDbTransactionComplete(transaction);
	const store = transaction.objectStore(PROFILE_STORE);
	const storedValue: unknown = await indexedDbRequestResult(store.get(PROFILE_ID));
	const storedProfile = profileFromStoredValue(storedValue);
	const weightHistory = recordRiderWeight(
		storedProfile?.weightHistory ?? profile.weightHistory,
		profile.riderWeightKg,
		updatedAt
	);
	const candidate = {
		...profile,
		bikes: profile.bikes.map((bike) => ({
			...bike,
			frontChainringTeeth: [...bike.frontChainringTeeth],
			rearCassetteTeeth: [...bike.rearCassetteTeeth],
		})),
		id: PROFILE_ID,
		updatedAt,
		version: PROFILE_VERSION,
		weightHistory,
	};
	const validatedProfile = profileFromStoredValue(candidate);
	if (!validatedProfile) {
		throw new Error('Invalid rider profile');
	}
	const record: StoredRiderProfile = {
		...validatedProfile,
		id: PROFILE_ID,
		updatedAt: candidate.updatedAt,
		version: PROFILE_VERSION,
	};
	store.put(record);
	await completed;
	return validatedProfile;
}

export function drivetrainGearCount(drivetrain: VirtualDrivetrain): number {
	return drivetrain.frontChainringTeeth.length * drivetrain.rearCassetteTeeth.length;
}

export function activeProfileBike(profile: RiderProfile): ProfileBike {
	return (
		profile.bikes.find((bike) => bike.id === profile.activeBikeId) ??
		profile.bikes.at(0) ??
		DEFAULT_PROFILE_BIKE
	);
}

export function activeRiderPhysicsProfile(profile: RiderProfile): RiderPhysicsProfile {
	const bike = activeProfileBike(profile);
	return {
		bikeId: bike.id,
		bikeName: bike.name,
		bikeWeightKg: bike.weightKg,
		frontChainringTeeth: [...bike.frontChainringTeeth],
		rearCassetteTeeth: [...bike.rearCassetteTeeth],
		riderWeightKg: profile.riderWeightKg,
	};
}

export function profileTotalMassKg(profile: RiderProfile): number {
	return profile.riderWeightKg + activeProfileBike(profile).weightKg;
}

export function poundsForKilograms(kilograms: number): number {
	return kilograms / KILOGRAMS_PER_POUND;
}

export function kilogramsForPounds(pounds: number): number {
	return pounds * KILOGRAMS_PER_POUND;
}

export function formattedTeeth(teeth: readonly number[]): string {
	return teeth.join('/');
}

export function parsedTeeth(value: string): number[] | undefined {
	const parts = value.trim().split(TEETH_SEPARATOR).filter(Boolean);
	if (parts.length === 0) {
		return;
	}
	const teeth = parts.map(Number);
	if (teeth.some((tooth) => !(Number.isFinite(tooth) && Number.isInteger(tooth) && tooth > 0))) {
		return;
	}
	return teeth;
}
