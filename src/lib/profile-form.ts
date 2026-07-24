import { z } from 'zod';
import type { SpeedUnit } from '../types';
import {
	activeProfileBike,
	DEFAULT_BIKE_WEIGHT_KG,
	DEFAULT_FRONT_CHAINRING_TEETH,
	DEFAULT_REAR_CASSETTE_TEETH,
	drivetrainGearCount,
	formattedTeeth,
	kilogramsForPounds,
	MAXIMUM_BIKE_COLOR_LENGTH,
	MAXIMUM_BIKE_MANUFACTURER_LENGTH,
	MAXIMUM_BIKE_MODEL_LENGTH,
	MAXIMUM_BIKE_NAME_LENGTH,
	MAXIMUM_BIKE_WEIGHT_KG,
	MAXIMUM_DRIVETRAIN_TEETH,
	MAXIMUM_PROFILE_BIKES,
	MAXIMUM_PROFILE_IDENTITY_LENGTH,
	MAXIMUM_PROFILE_NAME_LENGTH,
	MAXIMUM_RIDER_WEIGHT_KG,
	MAXIMUM_VIRTUAL_GEARS,
	MINIMUM_BIKE_WEIGHT_KG,
	MINIMUM_DRIVETRAIN_TEETH,
	MINIMUM_RIDER_WEIGHT_KG,
	PROFILE_IMAGE_TYPES,
	parsedTeeth,
	poundsForKilograms,
	type RiderProfile,
	validBikePurchaseDate,
} from './profile';
import { MAXIMUM_PROFILE_IMAGE_SOURCE_BYTES } from './profile-image';
import { SPEED_UNIT_OPTIONS } from './units';

const speedUnitSchema = z.custom<SpeedUnit>(
	(value) => SPEED_UNIT_OPTIONS.some((option) => option.value === value),
	'Choose a valid display unit.'
);

function imageSchema(label: 'bike' | 'profile') {
	return z
		.custom<Blob>(
			(value) =>
				value instanceof Blob && PROFILE_IMAGE_TYPES.some((type) => type === value.type),
			`Choose a JPEG, PNG, or WebP ${label} image.`
		)
		.refine(
			(image) => image.size <= MAXIMUM_PROFILE_IMAGE_SOURCE_BYTES,
			`Choose a ${label} image smaller than 32 MB.`
		)
		.optional();
}

export const profileImageSchema = imageSchema('profile');
export const bikeImageSchema = imageSchema('bike');

const bikeFormSchema = z.object({
	bikeWeight: z.string(),
	color: z
		.string()
		.max(
			MAXIMUM_BIKE_COLOR_LENGTH,
			`Bike color must be at most ${MAXIMUM_BIKE_COLOR_LENGTH} characters.`
		),
	frontChainrings: z.string(),
	id: z.string().min(1),
	image: bikeImageSchema,
	manufacturer: z
		.string()
		.max(
			MAXIMUM_BIKE_MANUFACTURER_LENGTH,
			`Manufacturer must be at most ${MAXIMUM_BIKE_MANUFACTURER_LENGTH} characters.`
		),
	model: z
		.string()
		.max(
			MAXIMUM_BIKE_MODEL_LENGTH,
			`Bike model must be at most ${MAXIMUM_BIKE_MODEL_LENGTH} characters.`
		),
	name: z
		.string()
		.min(1, 'Enter a bike name.')
		.max(
			MAXIMUM_BIKE_NAME_LENGTH,
			`Bike name must be at most ${MAXIMUM_BIKE_NAME_LENGTH} characters.`
		),
	purchasedOn: z
		.string()
		.refine(
			(value) => value === '' || validBikePurchaseDate(value),
			'Enter a valid purchase date.'
		),
	rearCassette: z.string(),
});

export type ProfileBikeFormValues = z.infer<typeof bikeFormSchema>;

function validateBikeForm(
	bike: ProfileBikeFormValues,
	index: number,
	speedUnit: SpeedUnit,
	context: z.RefinementCtx
): void {
	const unit = profileWeightUnit(speedUnit);
	const bikeRange = profileWeightRange(speedUnit, MINIMUM_BIKE_WEIGHT_KG, MAXIMUM_BIKE_WEIGHT_KG);
	const bikeWeightKg = storedProfileWeight(bike.bikeWeight, speedUnit);
	if (
		!Number.isFinite(bikeWeightKg) ||
		bikeWeightKg < MINIMUM_BIKE_WEIGHT_KG ||
		bikeWeightKg > MAXIMUM_BIKE_WEIGHT_KG
	) {
		context.addIssue({
			code: 'custom',
			message: `Enter a bike weight between ${bikeRange.minimum.toFixed(0)} and ${bikeRange.maximum.toFixed(0)} ${unit}.`,
			path: ['bikes', index, 'bikeWeight'],
		});
	}
	const drivetrainMessage = `Enter unique whole-number drivetrain teeth between ${MINIMUM_DRIVETRAIN_TEETH} and ${MAXIMUM_DRIVETRAIN_TEETH}, separated by slashes.`;
	const parsedFront = parsedTeeth(bike.frontChainrings);
	const parsedRear = parsedTeeth(bike.rearCassette);
	if (!(parsedFront && validDrivetrainTeeth(parsedFront))) {
		context.addIssue({
			code: 'custom',
			message: drivetrainMessage,
			path: ['bikes', index, 'frontChainrings'],
		});
	} else if (parsedFront.length > 3) {
		context.addIssue({
			code: 'custom',
			message: 'Enter no more than three front chainrings.',
			path: ['bikes', index, 'frontChainrings'],
		});
	}
	if (!(parsedRear && validDrivetrainTeeth(parsedRear))) {
		context.addIssue({
			code: 'custom',
			message: drivetrainMessage,
			path: ['bikes', index, 'rearCassette'],
		});
	}
	if (parsedFront && parsedRear) {
		const gearCount = drivetrainGearCount({
			frontChainringTeeth: parsedFront,
			rearCassetteTeeth: parsedRear,
		});
		if (gearCount > MAXIMUM_VIRTUAL_GEARS) {
			context.addIssue({
				code: 'custom',
				message: `This drivetrain creates ${gearCount} gears. Ride Control supports up to ${MAXIMUM_VIRTUAL_GEARS}.`,
				path: ['bikes', index, 'rearCassette'],
			});
		}
	}
}

export const profileFormSchema = z
	.object({
		activeBikeId: z.string().min(1),
		bikes: z
			.array(bikeFormSchema)
			.min(1, 'Add at least one bike.')
			.max(MAXIMUM_PROFILE_BIKES, `Add no more than ${MAXIMUM_PROFILE_BIKES} bikes.`),
		identity: z
			.string()
			.max(
				MAXIMUM_PROFILE_IDENTITY_LENGTH,
				`Identity must be at most ${MAXIMUM_PROFILE_IDENTITY_LENGTH} characters.`
			),
		image: profileImageSchema,
		name: z
			.string()
			.max(
				MAXIMUM_PROFILE_NAME_LENGTH,
				`Name must be at most ${MAXIMUM_PROFILE_NAME_LENGTH} characters.`
			),
		riderWeight: z.string(),
		speedUnit: speedUnitSchema,
	})
	.superRefine((values, context) => {
		const riderWeightKg = storedProfileWeight(values.riderWeight, values.speedUnit);
		const riderRange = profileWeightRange(
			values.speedUnit,
			MINIMUM_RIDER_WEIGHT_KG,
			MAXIMUM_RIDER_WEIGHT_KG
		);
		const unit = profileWeightUnit(values.speedUnit);
		if (
			!Number.isFinite(riderWeightKg) ||
			riderWeightKg < MINIMUM_RIDER_WEIGHT_KG ||
			riderWeightKg > MAXIMUM_RIDER_WEIGHT_KG
		) {
			context.addIssue({
				code: 'custom',
				message: `Enter a rider weight between ${riderRange.minimum.toFixed(0)} and ${riderRange.maximum.toFixed(0)} ${unit}.`,
				path: ['riderWeight'],
			});
		}
		if (!values.bikes.some((bike) => bike.id === values.activeBikeId)) {
			context.addIssue({
				code: 'custom',
				message: 'Choose an active bike.',
				path: ['activeBikeId'],
			});
		}
		if (new Set(values.bikes.map((bike) => bike.id)).size !== values.bikes.length) {
			context.addIssue({
				code: 'custom',
				message: 'Each bike must have a unique id.',
				path: ['bikes'],
			});
		}
		for (const [index, bike] of values.bikes.entries()) {
			validateBikeForm(bike, index, values.speedUnit, context);
		}
	});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function displayedProfileWeight(kilograms: number, speedUnit: SpeedUnit): string {
	const value = speedUnit === 'mph' ? poundsForKilograms(kilograms) : kilograms;
	return value.toFixed(1);
}

export function storedProfileWeight(value: string, speedUnit: SpeedUnit): number {
	const numericValue = Number(value);
	return speedUnit === 'mph' ? kilogramsForPounds(numericValue) : numericValue;
}

export function profileWeightRange(
	speedUnit: SpeedUnit,
	minimumKilograms: number,
	maximumKilograms: number
): { maximum: number; minimum: number } {
	if (speedUnit === 'kmh') {
		return { maximum: maximumKilograms, minimum: minimumKilograms };
	}
	return {
		maximum: Number(poundsForKilograms(maximumKilograms).toFixed(1)),
		minimum: Number(poundsForKilograms(minimumKilograms).toFixed(1)),
	};
}

export function profileWeightUnit(speedUnit: SpeedUnit): 'kg' | 'lb' {
	return speedUnit === 'mph' ? 'lb' : 'kg';
}

export function profileFormValues(profile: RiderProfile, speedUnit: SpeedUnit): ProfileFormValues {
	return {
		activeBikeId: activeProfileBike(profile).id,
		bikes: profile.bikes.map((bike) => ({
			bikeWeight: displayedProfileWeight(bike.weightKg, speedUnit),
			color: bike.color ?? '',
			frontChainrings: formattedTeeth(bike.frontChainringTeeth),
			id: bike.id,
			image: bike.image,
			manufacturer: bike.manufacturer ?? '',
			model: bike.model ?? '',
			name: bike.name,
			purchasedOn: bike.purchasedOn ?? '',
			rearCassette: formattedTeeth(bike.rearCassetteTeeth),
		})),
		identity: profile.identity,
		image: profile.image,
		name: profile.name,
		riderWeight: displayedProfileWeight(profile.riderWeightKg, speedUnit),
		speedUnit,
	};
}

export function profileFormValuesForSpeedUnit(
	values: ProfileFormValues,
	speedUnit: SpeedUnit
): ProfileFormValues {
	if (values.speedUnit === speedUnit) {
		return values;
	}
	const riderWeightKg = storedProfileWeight(values.riderWeight, values.speedUnit);
	return {
		...values,
		bikes: values.bikes.map((bike) => {
			const bikeWeightKg = storedProfileWeight(bike.bikeWeight, values.speedUnit);
			return {
				...bike,
				bikeWeight: Number.isFinite(bikeWeightKg)
					? displayedProfileWeight(bikeWeightKg, speedUnit)
					: bike.bikeWeight,
			};
		}),
		riderWeight: Number.isFinite(riderWeightKg)
			? displayedProfileWeight(riderWeightKg, speedUnit)
			: values.riderWeight,
		speedUnit,
	};
}

export function riderProfileFromFormValues(
	values: ProfileFormValues,
	previousProfile?: Pick<RiderProfile, 'riderWeightKg' | 'weightHistory'>
): RiderProfile {
	const validated = profileFormSchema.parse(values);
	const convertedRiderWeightKg = storedProfileWeight(validated.riderWeight, validated.speedUnit);
	const riderWeightKg =
		previousProfile &&
		displayedProfileWeight(previousProfile.riderWeightKg, validated.speedUnit) ===
			validated.riderWeight
			? previousProfile.riderWeightKg
			: convertedRiderWeightKg;
	return {
		activeBikeId: validated.activeBikeId,
		bikes: validated.bikes.map((bike) => {
			const frontChainringTeeth = parsedTeeth(bike.frontChainrings);
			const rearCassetteTeeth = parsedTeeth(bike.rearCassette);
			if (!(frontChainringTeeth && rearCassetteTeeth)) {
				throw new Error('The validated drivetrain could not be parsed.');
			}
			return {
				...(bike.color.trim() ? { color: bike.color.trim() } : {}),
				frontChainringTeeth,
				id: bike.id,
				...(bike.image ? { image: bike.image } : {}),
				...(bike.manufacturer.trim() ? { manufacturer: bike.manufacturer.trim() } : {}),
				...(bike.model.trim() ? { model: bike.model.trim() } : {}),
				name: bike.name.trim(),
				...(bike.purchasedOn ? { purchasedOn: bike.purchasedOn } : {}),
				rearCassetteTeeth,
				weightKg: storedProfileWeight(bike.bikeWeight, validated.speedUnit),
			};
		}),
		identity: validated.identity.trim(),
		image: validated.image,
		name: validated.name.trim(),
		riderWeightKg,
		weightHistory: previousProfile?.weightHistory ?? [],
	};
}

export function newProfileBikeFormValues(
	id: string,
	name: string,
	speedUnit: SpeedUnit
): ProfileBikeFormValues {
	return {
		bikeWeight: displayedProfileWeight(DEFAULT_BIKE_WEIGHT_KG, speedUnit),
		color: '',
		frontChainrings: formattedTeeth(DEFAULT_FRONT_CHAINRING_TEETH),
		id,
		image: undefined,
		manufacturer: '',
		model: '',
		name,
		purchasedOn: '',
		rearCassette: formattedTeeth(DEFAULT_REAR_CASSETTE_TEETH),
	};
}

function validDrivetrainTeeth(teeth: readonly number[]): boolean {
	return (
		teeth.every(
			(tooth) => tooth >= MINIMUM_DRIVETRAIN_TEETH && tooth <= MAXIMUM_DRIVETRAIN_TEETH
		) && new Set(teeth).size === teeth.length
	);
}
