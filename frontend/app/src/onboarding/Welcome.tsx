import { Icon } from "../components/Icon";
import foodReference from "../assets/onboarding/food-reference.png";
import foliageGarland from "../assets/onboarding/foliage-garland.png";

export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="ob-welcome">
      <div aria-hidden="true" className="ob-welcome-blob ob-welcome-blob--sage" />
      <div aria-hidden="true" className="ob-welcome-blob ob-welcome-blob--pink" />
      <div className="ob-welcome-inner">
        <section className="ob-welcome-copy">
          <h1 className="ob-display-title">
            Welcome to
            <br />
            MacroTerp.
          </h1>
          <p className="ob-welcome-text">
            Know what to eat before you get to the dining hall. Tell us your protein and calorie goals and your dietary preferences, and
            we’ll build you plates to choose from for every meal from today's menu.
          </p>
          <button className="ob-primary-button ob-welcome-start" onClick={onStart} type="button">
            Get started <Icon name="arrow-right" size={18} />
          </button>
        </section>
        <section aria-label="Grilled chicken, vegetables, and rice" className="ob-welcome-art">
          <div className="ob-welcome-disc" />
          <img alt="" aria-hidden="true" className="ob-welcome-garland" src={foliageGarland} />
          <div className="ob-food-cutout">
            <img alt="Overhead view of a nutritious chicken and vegetable meal" src={foodReference} />
          </div>
        </section>
      </div>
    </main>
  );
}
