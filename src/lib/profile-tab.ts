import { z } from 'zod';

export const PROFILE_TAB = {
	BIKES: 'bikes',
	PERSONAL: 'personal',
} as const;

export type ProfileTab = (typeof PROFILE_TAB)[keyof typeof PROFILE_TAB];

export const PROFILE_TAB_OPTIONS: readonly { label: string; value: ProfileTab }[] = [
	{ label: 'Personal details', value: PROFILE_TAB.PERSONAL },
	{ label: 'Bikes', value: PROFILE_TAB.BIKES },
];

export const profileTabSchema = z.enum([PROFILE_TAB.PERSONAL, PROFILE_TAB.BIKES]);
