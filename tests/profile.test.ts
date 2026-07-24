import { describe, expect, test } from 'bun:test';
import {
	activeProfileBike,
	activeRiderPhysicsProfile,
	DEFAULT_BIKE_WEIGHT_KG,
	DEFAULT_FRONT_CHAINRING_TEETH,
	DEFAULT_REAR_CASSETTE_TEETH,
	DEFAULT_RIDER_PROFILE,
	DEFAULT_RIDER_WEIGHT_KG,
	drivetrainGearCount,
	formattedTeeth,
	kilogramsForPounds,
	parsedTeeth,
	poundsForKilograms,
	profileFromStoredValue,
	profileTotalMassKg,
	recordRiderWeight,
	riderPhysicsProfileFromStoredValue,
	sameRiderPhysicsProfile,
	snapshotRiderPhysicsProfile,
} from '../src/lib/profile';

describe('rider profile', () => {
	test('provides a neutral local profile with the existing 2×12 drivetrain', () => {
		expect(DEFAULT_RIDER_PROFILE.name).toBe('');
		expect(DEFAULT_RIDER_PROFILE.identity).toBe('');
		expect(activeProfileBike(DEFAULT_RIDER_PROFILE).name).toBe('My bike');
		expect(profileTotalMassKg(DEFAULT_RIDER_PROFILE)).toBe(
			DEFAULT_RIDER_WEIGHT_KG + DEFAULT_BIKE_WEIGHT_KG
		);
		expect(
			drivetrainGearCount({
				frontChainringTeeth: DEFAULT_FRONT_CHAINRING_TEETH,
				rearCassetteTeeth: DEFAULT_REAR_CASSETTE_TEETH,
			})
		).toBe(24);
	});

	test('parses familiar drivetrain notation', () => {
		expect(parsedTeeth('53/39')).toEqual([53, 39]);
		expect(parsedTeeth('12, 13 14/15')).toEqual([12, 13, 14, 15]);
		expect(parsedTeeth('53.5/39')).toBeUndefined();
		expect(parsedTeeth('')).toBeUndefined();
		expect(formattedTeeth([53, 39])).toBe('53/39');
	});

	test('round trips pounds and kilograms', () => {
		expect(kilogramsForPounds(poundsForKilograms(84))).toBeCloseTo(84, 10);
	});

	test('validates and independently copies the physics-only session profile', () => {
		const profile = riderPhysicsProfileFromStoredValue({
			bikeId: 'road-bike',
			bikeName: 'Road bike',
			bikeWeightKg: 8.5,
			frontChainringTeeth: [50, 34],
			rearCassetteTeeth: [11, 13, 15, 17],
			riderWeightKg: 68,
		});
		expect(profile).toEqual({
			bikeId: 'road-bike',
			bikeName: 'Road bike',
			bikeWeightKg: 8.5,
			frontChainringTeeth: [50, 34],
			rearCassetteTeeth: [11, 13, 15, 17],
			riderWeightKg: 68,
		});
		if (!profile) {
			return;
		}
		const snapshot = snapshotRiderPhysicsProfile(profile);
		expect(snapshot).toEqual(profile);
		expect(snapshot.frontChainringTeeth).not.toBe(profile.frontChainringTeeth);
		expect(snapshot.rearCassetteTeeth).not.toBe(profile.rearCassetteTeeth);
		expect(sameRiderPhysicsProfile(snapshot, profile)).toBe(true);
		expect(
			sameRiderPhysicsProfile(snapshot, {
				...profile,
				riderWeightKg: 69,
			})
		).toBe(false);
		expect(
			riderPhysicsProfileFromStoredValue({
				...profile,
				riderWeightKg: -1,
			})
		).toBeUndefined();
	});

	test('migrates a version 1 IndexedDB profile into one named bike', () => {
		const image = new Blob(['profile'], { type: 'image/png' });
		expect(
			profileFromStoredValue({
				bikeWeightKg: 8.5,
				frontChainringTeeth: [50, 34],
				identity: 'Non-binary',
				image,
				name: 'Riley',
				rearCassetteTeeth: [11, 13, 15, 17],
				riderWeightKg: 68,
				version: 1,
			})
		).toEqual({
			activeBikeId: 'default-bike',
			bikes: [
				{
					frontChainringTeeth: [50, 34],
					id: 'default-bike',
					name: 'My bike',
					rearCassetteTeeth: [11, 13, 15, 17],
					weightKg: 8.5,
				},
			],
			identity: 'Non-binary',
			image,
			name: 'Riley',
			riderWeightKg: 68,
			weightHistory: [],
		});
		expect(
			profileFromStoredValue({
				bikeWeightKg: 8.5,
				frontChainringTeeth: [50, 34],
				identity: '',
				name: 'Riley',
				rearCassetteTeeth: Array.from({ length: 13 }, (_, index) => index + 10),
				riderWeightKg: 68,
				version: 1,
			})
		).toBeUndefined();
	});

	test('records only actual rider weight changes over time', () => {
		const first = recordRiderWeight([], 75, 1000);
		expect(first).toEqual([{ recordedAt: 1000, weightKg: 75 }]);
		expect(recordRiderWeight(first, 75, 2000)).toBe(first);
		expect(recordRiderWeight(first, 74.5, 3000)).toEqual([
			{ recordedAt: 1000, weightKg: 75 },
			{ recordedAt: 3000, weightKg: 74.5 },
		]);
	});

	test('validates multiple bikes and derives the active session snapshot', () => {
		const bikeImage = new Blob(['bike'], { type: 'image/webp' });
		const profile = profileFromStoredValue({
			activeBikeId: 'gravel-bike',
			bikes: [
				{
					frontChainringTeeth: [53, 39],
					id: 'road-bike',
					name: 'Road bike',
					rearCassetteTeeth: [12, 13, 14, 15],
					weightKg: 8.5,
				},
				{
					color: 'Forest green',
					frontChainringTeeth: [46, 30],
					id: 'gravel-bike',
					image: bikeImage,
					manufacturer: 'Cannondale',
					model: 'Topstone',
					name: 'Gravel bike',
					purchasedOn: '2024-04-20',
					rearCassetteTeeth: [11, 13, 15, 18],
					weightKg: 11,
				},
			],
			identity: '',
			name: 'Riley',
			riderWeightKg: 68,
			version: 2,
		});
		expect(profile).toBeDefined();
		if (!profile) {
			return;
		}
		expect(activeProfileBike(profile).name).toBe('Gravel bike');
		expect(activeProfileBike(profile)).toMatchObject({
			color: 'Forest green',
			image: bikeImage,
			manufacturer: 'Cannondale',
			model: 'Topstone',
			purchasedOn: '2024-04-20',
		});
		expect(activeRiderPhysicsProfile(profile)).toEqual({
			bikeId: 'gravel-bike',
			bikeName: 'Gravel bike',
			bikeWeightKg: 11,
			frontChainringTeeth: [46, 30],
			rearCassetteTeeth: [11, 13, 15, 18],
			riderWeightKg: 68,
		});
		expect(profileTotalMassKg(profile)).toBe(79);
		expect(
			profileFromStoredValue({
				...profile,
				activeBikeId: 'missing-bike',
				version: 2,
			})
		).toBeUndefined();
		expect(
			profileFromStoredValue({
				...profile,
				activeBikeId: 'road-bike',
				bikes: [{ ...profile.bikes[0], purchasedOn: '2025-02-29' }],
				version: 2,
			})
		).toBeUndefined();
	});
});
