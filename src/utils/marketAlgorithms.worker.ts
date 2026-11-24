import type { PostMatchReview } from '../types/fortuneActuary';
import { compareAlgorithms } from './marketAlgorithms';

export interface AlgorithmRequest {
  reviews: PostMatchReview[];
  verifiedOnly: boolean;
}

export type AlgorithmResponse = ReturnType<typeof compareAlgorithms>;

self.onmessage = ({ data }: MessageEvent<AlgorithmRequest>) => {
  self.postMessage(compareAlgorithms(data.reviews, data.verifiedOnly));
};
