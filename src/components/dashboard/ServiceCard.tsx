import { motion } from 'framer-motion';
import { LucideIcon, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ServiceCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  path?: string;
  delay?: number;
}

export function ServiceCard({ icon: Icon, title, description, color, path, delay = 0 }: ServiceCardProps) {
  const navigate = useNavigate();
  return (
    <motion.button
      type="button"
      onClick={() => path && navigate(path)}
      className="service-card group text-left w-full"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1.5">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">{description}</p>
      <div className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
        <span>Acessar</span>
        <ArrowRight className="w-3 h-3" />
      </div>
    </motion.button>
  );
}
