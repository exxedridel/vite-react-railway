import { motion } from "framer-motion";

const Loader = () => {
  return (
    <motion.ul className="flex justify-center items-center gap-2 h-4 w-20">
      {[...Array(3)].map((_, index) => (
        <motion.li
          key={index}
          className="w-4 h-4 bg-primary-light rounded"
          animate={{
            width: [16, 4, 16],
            height: [16, 4, 16],
            opacity: [0.25, 1, 0.25],
            backgroundColor: [
              "rgb(116 180 236)",
              "rgb(255 255 255)",
              "rgb(116 180 236)",
            ],
          }}
          transition={{
            repeat: Infinity,
            delay: index * 0.125,
            // yoyo: Infinity,
            duration: 1,
          }}
        />
      ))}
    </motion.ul>
  );
};

export default Loader;
