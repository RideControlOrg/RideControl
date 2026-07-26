import { describe, expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import { DEFAULT_RIDER_PROFILE, loadRiderProfile, saveRiderProfile } from '../src/lib/profile';

describe('rider profile IndexedDB history', () => {
	test('updates recent weight corrections and appends later changes', async () => {
		const first = await saveRiderProfile(DEFAULT_RIDER_PROFILE, 1000);
		expect(first.weightHistory).toEqual([{ recordedAt: 1000, weightKg: 75 }]);

		const unchanged = await saveRiderProfile({ ...first, name: 'Riley' }, 2000);
		expect(unchanged.weightHistory).toEqual(first.weightHistory);

		const changed = await saveRiderProfile({ ...unchanged, riderWeightKg: 74.5 }, 3000);
		expect(changed.weightHistory).toEqual([{ recordedAt: 3000, weightKg: 74.5 }]);

		const later = await saveRiderProfile(
			{ ...changed, riderWeightKg: 74 },
			60 * 60 * 1000 + 3000
		);
		expect(later.weightHistory).toEqual([
			{ recordedAt: 3000, weightKg: 74.5 },
			{ recordedAt: 60 * 60 * 1000 + 3000, weightKg: 74 },
		]);
		expect((await loadRiderProfile()).weightHistory).toEqual(later.weightHistory);
	});

	test('extends the correction window from the latest weight edit', async () => {
		const profile = await saveRiderProfile(
			{ ...DEFAULT_RIDER_PROFILE, riderWeightKg: 76 },
			10 * 60 * 60 * 1000
		);
		const firstCorrection = await saveRiderProfile(
			{ ...profile, riderWeightKg: 75.5 },
			10 * 60 * 60 * 1000 + 59 * 60 * 1000
		);
		const secondCorrection = await saveRiderProfile(
			{ ...firstCorrection, riderWeightKg: 75 },
			10 * 60 * 60 * 1000 + 118 * 60 * 1000
		);

		expect(secondCorrection.weightHistory).toEqual([
			...profile.weightHistory.slice(0, -1),
			{
				recordedAt: 10 * 60 * 60 * 1000 + 118 * 60 * 1000,
				weightKg: 75,
			},
		]);
	});

	test('persists recent custom identities and returns them newest first', async () => {
		const first = await saveRiderProfile({ ...DEFAULT_RIDER_PROFILE, identity: 'Smurf' }, 4000);
		expect(first.identityHistory).toEqual(['Smurf']);

		const second = await saveRiderProfile({ ...first, identity: 'Cyclist' }, 5000);
		expect(second.identityHistory).toEqual(['Cyclist', 'Smurf']);

		const standard = await saveRiderProfile({ ...second, identity: 'Woman' }, 6000);
		expect(standard.identityHistory).toEqual(['Cyclist', 'Smurf']);

		const removed = await saveRiderProfile({ ...standard, identityHistory: ['Cyclist'] }, 7000);
		expect(removed.identityHistory).toEqual(['Cyclist']);
		expect((await loadRiderProfile()).identityHistory).toEqual(['Cyclist']);
	});
});
