import type { Arc, Project } from '../db/queries/planner/types';
import { PROJECT_COLOR } from './quickAddMentions';
import {
  Airplane, Atom, Bank, Barbell, Bed, BookOpen, Brain, Briefcase, Buildings, Camera, Car, ChartLineUp, Code, Coffee, Compass,
  Flag, Flask, Folder, ForkKnife, GameController, Globe, GraduationCap, Heart, House, Leaf, Lightbulb, MusicNotes, Newspaper,
  PaintBrush, PenNib, Plant, Rocket, ShoppingCart, Star, Target, Terminal, Trophy, Users, Wallet, Wrench,
  type Icon, type IconProps,
} from '@phosphor-icons/react';

/** The icons an arc or project can be given, by the name stored in the database. Order is the picker's order. */
export const PLANNER_ICONS: Readonly<Record<string, Icon>> = {
  Briefcase, GraduationCap, Flask, Atom, Brain, BookOpen, Code, Terminal, Lightbulb, Rocket,
  Target, Flag, Trophy, Star, Compass, Globe, ChartLineUp, Bank, Wallet, ShoppingCart,
  Heart, Barbell, Leaf, Plant, ForkKnife, Coffee, Bed, House, Buildings, Car,
  Airplane, Camera, MusicNotes, PaintBrush, PenNib, Newspaper, GameController, Users, Wrench, Folder,
};

export const ICON_NAMES: readonly string[] = Object.keys(PLANNER_ICONS);

/** The icon named `icon`, or `fallback` when none is chosen (or the name is no longer known). */
export function EntityIcon({ icon, fallback, ...props }: { icon: string; fallback: Icon } & IconProps) {
  const Component = PLANNER_ICONS[icon] ?? fallback;
  return <Component {...props} />;
}

/** An arc's icon in its own color (a compass until one is chosen). */
export function ArcIcon({ arc, ...props }: { arc: Pick<Arc, 'icon' | 'colorHex'> } & IconProps) {
  return <EntityIcon icon={arc.icon} fallback={Compass} weight="bold" color={arc.colorHex} {...props} />;
}

/** A project's icon, in the neutral project color unless told otherwise (a folder until one is chosen). */
export function ProjectIcon({ project, ...props }: { project: Pick<Project, 'icon'> } & IconProps) {
  return <EntityIcon icon={project.icon} fallback={Folder} weight="bold" color={PROJECT_COLOR} {...props} />;
}
