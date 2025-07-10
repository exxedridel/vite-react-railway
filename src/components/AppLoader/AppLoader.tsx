"use client";

import { AnimatePresence, motion } from "framer-motion";
import React from "react";
import Loader from "../Loader";
import { Portal } from "@radix-ui/react-portal";

const AppLoader: React.FC = () => {
  const loaderVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
    },
    exit: {
      opacity: 0,
    },
  };

  if (typeof document === "undefined") return null;

  return (
    <Portal container={document?.querySelector("body") as HTMLElement}>
      <motion.div
        variants={loaderVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        tabIndex={-1}
        aria-hidden="true"
        className="fixed inset-0 z-[999] flex items-center justify-center w-screen h-screen bg-primary/30"
      >
        <Loader />
      </motion.div>
    </Portal>
  );
};

export default AppLoader;
