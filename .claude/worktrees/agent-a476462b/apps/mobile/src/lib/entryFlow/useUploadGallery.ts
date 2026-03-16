import { useRef, useState, type RefCallback } from "react";
import type { ScrollView } from "react-native";

export function useUploadGallery(totalPhotoCount: number) {
  const [uploadGalleryActiveIndex, setUploadGalleryActiveIndex] = useState(0);
  const [uploadGalleryFrameWidth, setUploadGalleryFrameWidth] = useState(0);
  const uploadGalleryScrollRef = useRef<ScrollView | null>(null);
  const maxIndex = Math.max(0, totalPhotoCount - 1);
  const clampedActiveIndex = Math.max(
    0,
    Math.min(maxIndex, uploadGalleryActiveIndex)
  );

  const setUploadGalleryScrollNode: RefCallback<ScrollView> = (node) => {
    uploadGalleryScrollRef.current = node;
  };

  const handleUploadGalleryLayout = (layoutWidth: number) => {
    if (layoutWidth <= 0) {
      return;
    }
    if (Math.abs(layoutWidth - uploadGalleryFrameWidth) <= 0.5) {
      return;
    }

    setUploadGalleryFrameWidth(layoutWidth);
    if (uploadGalleryScrollRef.current && totalPhotoCount > 1) {
      uploadGalleryScrollRef.current.scrollTo({
        x: clampedActiveIndex * layoutWidth,
        animated: false,
      });
    }
  };

  const handleUploadGalleryMomentumEnd = (offsetX: number) => {
    if (uploadGalleryFrameWidth <= 0) {
      return;
    }
    const nextIndex = Math.round(offsetX / uploadGalleryFrameWidth);
    const maxIndex = Math.max(0, totalPhotoCount - 1);
    const clampedIndex = Math.max(0, Math.min(maxIndex, nextIndex));
    setUploadGalleryActiveIndex(clampedIndex);
    const snappedX = clampedIndex * uploadGalleryFrameWidth;
    if (
      Math.abs(offsetX - snappedX) > 0.5 &&
      uploadGalleryScrollRef.current
    ) {
      uploadGalleryScrollRef.current.scrollTo({
        x: snappedX,
        animated: false,
      });
    }
  };

  const scrollToUploadPhotoIndex = (index: number, animated = true) => {
    if (!uploadGalleryScrollRef.current || uploadGalleryFrameWidth <= 0) {
      return;
    }
    const maxIndex = Math.max(0, totalPhotoCount - 1);
    const nextIndex = Math.max(0, Math.min(maxIndex, index));
    setUploadGalleryActiveIndex(nextIndex);
    uploadGalleryScrollRef.current.scrollTo({
      x: nextIndex * uploadGalleryFrameWidth,
      animated,
    });
  };

  const resetUploadGallery = () => {
    setUploadGalleryActiveIndex(0);
  };

  return {
    uploadGalleryActiveIndex: clampedActiveIndex,
    uploadGalleryFrameWidth,
    setUploadGalleryScrollNode,
    handleUploadGalleryLayout,
    handleUploadGalleryMomentumEnd,
    scrollToUploadPhotoIndex,
    resetUploadGallery,
  };
}
