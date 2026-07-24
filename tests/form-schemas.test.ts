import { describe, expect, test } from 'bun:test';
import { FormApi } from '@tanstack/react-form';
import { formErrorMessage } from '../src/lib/form-errors';
import { DEFAULT_RIDER_PROFILE } from '../src/lib/profile';
import {
	profileFormSchema,
	profileFormValues,
	profileFormValuesForSpeedUnit,
	riderProfileFromFormValues,
} from '../src/lib/profile-form';
import { renameWorkoutFormSchema } from '../src/lib/rename-workout-form';
import { MAXIMUM_SESSION_DESCRIPTION_LENGTH } from '../src/lib/session-description';
import { sessionMetadataFromFormValues, sessionSaveFormSchema } from '../src/lib/session-save-form';
import { welcomeFormSchema } from '../src/lib/welcome-form';

describe('dialog form schemas', () => {
	test('round trips the default profile through validated form values', () => {
		const values = profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh');
		expect(profileFormSchema.safeParse(values).success).toBeTrue();
		expect(riderProfileFromFormValues(values)).toEqual(DEFAULT_RIDER_PROFILE);
	});

	test('preserves profile weights when display units change', () => {
		const metric = profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh');
		const imperial = profileFormValuesForSpeedUnit(metric, 'mph');
		const metricAgain = profileFormValuesForSpeedUnit(imperial, 'kmh');
		expect(imperial.speedUnit).toBe('mph');
		expect(imperial.riderWeight).toBe('165.3');
		expect(metricAgain.riderWeight).toBe(metric.riderWeight);
		expect(metricAgain.bikes[0]?.bikeWeight).toBe(metric.bikes[0]?.bikeWeight);
	});

	test('tracks unsaved profile edits and clears them after reset', () => {
		const defaults = profileFormValues(DEFAULT_RIDER_PROFILE, 'mph');
		const form = new FormApi({
			defaultValues: defaults,
			validators: {
				onChange: profileFormSchema,
				onSubmit: profileFormSchema,
			},
		});
		const unmount = form.mount();
		expect(form.state.isDirty).toBeFalse();
		form.setFieldValue('name', 'Riley');
		expect(form.state.isDirty).toBeTrue();
		form.reset(defaults);
		expect(form.state.isDirty).toBeFalse();
		unmount();
	});

	test('normalizes validated profile text and drivetrain values', () => {
		const defaults = profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh');
		const [defaultBike] = defaults.bikes;
		const [defaultDomainBike] = DEFAULT_RIDER_PROFILE.bikes;
		if (!(defaultBike && defaultDomainBike)) {
			throw new Error('Expected a default bike');
		}
		const values = {
			...defaults,
			bikes: [
				{
					...defaultBike,
					frontChainrings: '50 / 34',
					name: ' Road bike ',
					rearCassette: '11,13,15,17',
				},
			],
			identity: ' Non-binary ',
			name: ' Riley ',
		};
		expect(riderProfileFromFormValues(values)).toEqual({
			...DEFAULT_RIDER_PROFILE,
			bikes: [
				{
					...defaultDomainBike,
					frontChainringTeeth: [50, 34],
					name: 'Road bike',
					rearCassetteTeeth: [11, 13, 15, 17],
				},
			],
			identity: 'Non-binary',
			image: undefined,
			name: 'Riley',
		});
	});

	test('reports profile weight and drivetrain errors on their fields', () => {
		const defaults = profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh');
		const [defaultBike] = defaults.bikes;
		if (!defaultBike) {
			throw new Error('Expected a default bike');
		}
		const values = {
			...defaults,
			bikes: [
				{
					...defaultBike,
					frontChainrings: '53/53',
					rearCassette: '1/2/3',
				},
			],
			riderWeight: '0',
		};
		const result = profileFormSchema.safeParse(values);
		expect(result.success).toBeFalse();
		if (result.success) {
			return;
		}
		expect(result.error.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ path: ['riderWeight'] }),
				expect.objectContaining({ path: ['bikes', 0, 'frontChainrings'] }),
				expect.objectContaining({ path: ['bikes', 0, 'rearCassette'] }),
			])
		);
	});

	test('rejects too many chainrings and virtual gears', () => {
		const defaults = profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh');
		const [defaultBike] = defaults.bikes;
		if (!defaultBike) {
			throw new Error('Expected a default bike');
		}
		const result = profileFormSchema.safeParse({
			...defaults,
			bikes: [
				{
					...defaultBike,
					frontChainrings: '56/50/44/38',
					rearCassette: '11/12/13/14/15/16/17',
				},
			],
		});
		expect(result.success).toBeFalse();
		if (result.success) {
			return;
		}
		expect(result.error.issues.map((issue) => issue.message)).toEqual(
			expect.arrayContaining([
				'Enter no more than three front chainrings.',
				'This drivetrain creates 28 gears. Ride Control supports up to 24.',
			])
		);
	});

	test('keeps multiple bikes and the active selection independent', () => {
		const defaults = profileFormValues(DEFAULT_RIDER_PROFILE, 'mph');
		const [roadBike] = defaults.bikes;
		if (!roadBike) {
			throw new Error('Expected a default bike');
		}
		const profile = riderProfileFromFormValues({
			...defaults,
			activeBikeId: 'gravel-bike',
			bikes: [
				{ ...roadBike, id: 'road-bike', name: 'Road bike' },
				{
					...roadBike,
					bikeWeight: '24.3',
					color: ' Forest green ',
					frontChainrings: '46/30',
					id: 'gravel-bike',
					manufacturer: ' Cannondale ',
					model: ' Topstone ',
					name: 'Gravel bike',
					purchasedOn: '2024-04-20',
					rearCassette: '11/13/15/17/19/21/24/28/32/36/40/44',
				},
			],
		});
		expect(profile.activeBikeId).toBe('gravel-bike');
		expect(profile.bikes).toHaveLength(2);
		expect(profile.bikes[0]?.name).toBe('Road bike');
		expect(profile.bikes[1]).toMatchObject({
			color: 'Forest green',
			frontChainringTeeth: [46, 30],
			id: 'gravel-bike',
			manufacturer: 'Cannondale',
			model: 'Topstone',
			name: 'Gravel bike',
			purchasedOn: '2024-04-20',
			rearCassetteTeeth: [11, 13, 15, 17, 19, 21, 24, 28, 32, 36, 40, 44],
		});
		expect(profile.bikes[1]?.weightKg).toBeCloseTo(11.02, 2);
	});

	test('accepts 1× bikes with either 11 or 12 rear gears', () => {
		const defaults = profileFormValues(DEFAULT_RIDER_PROFILE, 'kmh');
		const [defaultBike] = defaults.bikes;
		if (!defaultBike) {
			throw new Error('Expected a default bike');
		}
		for (const rearCassette of [
			'11/13/15/17/19/21/24/28/32/36/42',
			'10/12/14/16/18/21/24/28/32/36/42/50',
		]) {
			const values = {
				...defaults,
				bikes: [
					{
						...defaultBike,
						frontChainrings: '42',
						rearCassette,
					},
				],
			};
			expect(profileFormSchema.safeParse(values).success).toBeTrue();
			const [bike] = riderProfileFromFormValues(values).bikes;
			expect(bike?.frontChainringTeeth).toEqual([42]);
			expect(bike?.rearCassetteTeeth).toEqual(rearCassette.split('/').map(Number));
		}
	});

	test('accepts supported rider and bike images and rejects unsafe files', () => {
		const values = profileFormValues(DEFAULT_RIDER_PROFILE, 'mph');
		const [bike] = values.bikes;
		if (!bike) {
			throw new Error('Expected a default bike');
		}
		const image = new Blob(['image'], { type: 'image/webp' });
		expect(
			profileFormSchema.safeParse({
				...values,
				bikes: [{ ...bike, image }],
				image,
			}).success
		).toBeTrue();
		expect(
			profileFormSchema.safeParse({
				...values,
				image: new Blob(['document'], { type: 'application/pdf' }),
			}).success
		).toBeFalse();
		expect(
			profileFormSchema.safeParse({
				...values,
				bikes: [
					{
						...bike,
						image: new Blob(['document'], { type: 'application/pdf' }),
					},
				],
			}).success
		).toBeFalse();
		const oversizedImage = new Blob(['image'], { type: 'image/jpeg' });
		Object.defineProperty(oversizedImage, 'size', { value: 32 * 1024 * 1024 + 1 });
		expect(
			profileFormSchema.safeParse({
				...values,
				bikes: [{ ...bike, image: oversizedImage }],
			}).success
		).toBeFalse();
	});

	test('validates optional bike metadata', () => {
		const values = profileFormValues(DEFAULT_RIDER_PROFILE, 'mph');
		const [bike] = values.bikes;
		if (!bike) {
			throw new Error('Expected a default bike');
		}
		expect(
			profileFormSchema.safeParse({
				...values,
				bikes: [{ ...bike, purchasedOn: '2024-02-29' }],
			}).success
		).toBeTrue();
		expect(
			profileFormSchema.safeParse({
				...values,
				bikes: [{ ...bike, purchasedOn: '2025-02-29' }],
			}).success
		).toBeFalse();
	});

	test('validates and trims renamed workout names', () => {
		expect(renameWorkoutFormSchema.parse({ name: '  Morning ride  ' })).toEqual({
			name: 'Morning ride',
		});
		expect(renameWorkoutFormSchema.safeParse({ name: '   ' }).success).toBeFalse();
	});

	test('validates session metadata and trims the description', () => {
		expect(
			sessionMetadataFromFormValues({
				comments: '  Felt strong  ',
				feeling: 'great',
			})
		).toEqual({ comments: 'Felt strong', feeling: 'great' });
		expect(
			sessionSaveFormSchema.safeParse({
				comments: 'x'.repeat(MAXIMUM_SESSION_DESCRIPTION_LENGTH + 1),
				feeling: 'great',
			}).success
		).toBeFalse();
		expect(
			sessionSaveFormSchema.safeParse({
				comments: '',
				feeling: 'unrecognized',
			}).success
		).toBeFalse();
	});

	test('extracts readable TanStack field errors from Zod issues', () => {
		expect(formErrorMessage({ message: 'Enter a valid weight.' })).toBe(
			'Enter a valid weight.'
		);
		expect(formErrorMessage('Required')).toBe('Required');
		expect(formErrorMessage({})).toBe('Enter a valid value.');
	});

	test('accepts only a boolean welcome preference', () => {
		expect(welcomeFormSchema.safeParse({ dontShowAgain: true }).success).toBeTrue();
		expect(welcomeFormSchema.safeParse({ dontShowAgain: 'true' }).success).toBeFalse();
	});
});
