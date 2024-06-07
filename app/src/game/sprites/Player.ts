import Phaser from "phaser";

import { key } from "../data";

export const CAMERA_ZOOM = 2;

enum Animation {
  Left = "Left",
  Right = "Right",
  Up = "Up",
  Down = "Down",
}

type Cursors = Record<"w" | "a" | "s" | "d" | "up" | "left" | "down" | "right", Phaser.Input.Keyboard.Key>;

const Velocity = {
  Horizontal: 175,
  Vertical: 175,
} as const;

export default class Player extends Phaser.Physics.Arcade.Sprite {
  // @ts-expect-error wip
  body!: Phaser.Physics.Arcade.Body;
  originalPosition: { x: number; y: number } = { x: 0, y: 0 };
  isReturning = false;

  constructor(scene: Phaser.Scene, x: number, y: number, texture = key.atlas.player, frame = "player-idle-south.000") {
    super(scene, x, y, texture, frame);

    this.originalPosition.x = x;
    this.originalPosition.y = y;

    // Add the sprite to the scene
    scene.add.existing(this);

    // Enable physics for the sprite
    scene.physics.world.enable(this);

    // The image has a bit of whitespace so use setSize and
    // setOffset to control the size of the player's body
    this.setSize(16, 16).setOffset(0, 16);

    this.setScale(2);

    // Collide the sprite body with the world boundary
    this.setCollideWorldBounds(true);

    // Create sprite animations
    this.createAnimations();
  }

  private createAnimations() {
    const anims = this.scene.anims;

    // Create left animation
    if (!anims.exists(Animation.Left)) {
      anims.create({
        key: Animation.Left,
        frames: anims.generateFrameNames(key.atlas.player, {
          prefix: "player-walk-west.",
          start: 0,
          end: 3,
          zeroPad: 3,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }

    // Create right animation
    if (!anims.exists(Animation.Right)) {
      anims.create({
        key: Animation.Right,
        frames: anims.generateFrameNames(key.atlas.player, {
          prefix: "player-walk-east.",
          start: 0,
          end: 3,
          zeroPad: 3,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }

    // Create up animation
    if (!anims.exists(Animation.Up)) {
      anims.create({
        key: Animation.Up,
        frames: anims.generateFrameNames(key.atlas.player, {
          prefix: "player-walk-north.",
          start: 0,
          end: 3,
          zeroPad: 3,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }

    // Create down animation
    if (!anims.exists(Animation.Down)) {
      anims.create({
        key: Animation.Down,
        frames: anims.generateFrameNames(key.atlas.player, {
          prefix: "player-walk-south.",
          start: 0,
          end: 3,
          zeroPad: 3,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  jumpAwayFrom(object: Phaser.GameObjects.Rectangle) {
    const x = object.x;

    setTimeout(() => {
      const directionMultiplier = x < this.x ? 1 : -1;
      const jumpDistanceX = 80;
      const jumpHeightY = -20;

      if (directionMultiplier === 1) {
        this.setTexture("player", "player-walk-west.000");
      } else {
        this.setTexture("player", "player-walk-east.000");
      }

      this.scene.tweens.add({
        targets: this,
        x: { value: `+=${jumpDistanceX * directionMultiplier}`, duration: 500, ease: "Power1" },
        y: { value: `+=${jumpHeightY}`, duration: 250, ease: "Power2", yoyo: true, hold: 0 },
        onComplete: () => {
          setTimeout(() => {
            this.setTexture("player", "player-walk-south.000");
            this.onFinishJump();
          }, 1000);
        },
      });
    }, 500);
  }

  onFinishJump() {
    setTimeout(() => {
      this.returnToCenter();
    }, 2000);
  }

  returnToCenter() {
    this.isReturning = true; // Set the flag to true when starting to return

    const directionX = this.originalPosition.x - this.x;

    this.scene.tweens.add({
      targets: this,
      x: { value: this.originalPosition.x, duration: 3000, ease: "Power1" },
      onComplete: () => {
        this.isReturning = false; // Reset the flag once the movement is complete
        // Stop any animations and set to idle
        this.anims.stop();
        const idleFrame = "player-idle-south.000";
        this.setTexture(key.atlas.player, idleFrame);

        const random = Math.floor(Math.random() * (2000 - 1000 + 1)) + 2000;

        setTimeout(() => {
          let animationKey;
          animationKey = directionX > 0 ? "player-walk-east.000" : "player-walk-west.000";

          this.setTexture(key.atlas.player, animationKey);

          setTimeout(() => {
            this.setTexture(key.atlas.player, "player-idle-south.000");
          }, random);
        }, 4000 - random);
      },
    });
  }

  update() {
    const { anims, body } = this;

    if (this.isReturning) {
      const directionX = this.originalPosition.x - this.x;
      const animationKey = directionX > 0 ? Animation.Right : Animation.Left;
      this.anims.play(animationKey, true);
      return;
    }

    const prevVelocity = body.velocity.clone();

    // Stop any previous movement from the last frame
    body.setVelocity(0);

    // // Horizontal movement
    // switch (true) {
    //   case cursors.left.isDown:
    //   case cursors.a.isDown:
    //     body.setVelocityX(-Velocity.Horizontal);
    //     break;

    //   case cursors.right.isDown:
    //   case cursors.d.isDown:
    //     body.setVelocityX(Velocity.Horizontal);
    //     break;
    // }

    // // Vertical movement
    // switch (true) {
    //   case cursors.up.isDown:
    //   case cursors.w.isDown:
    //     body.setVelocityY(-Velocity.Vertical);
    //     break;

    //   case cursors.down.isDown:
    //   case cursors.s.isDown:
    //     body.setVelocityY(Velocity.Vertical);
    //     break;
    // }

    // Normalize and scale the velocity so that player can't move faster along a diagonal
    body.velocity.normalize().scale(Velocity.Horizontal);

    // // Update the animation last and give left/right animations precedence over up/down animations
    // switch (true) {
    //   case cursors.left.isDown:
    //   case cursors.a.isDown:
    //     anims.play(Animation.Left, true);
    //     break;

    //   case cursors.right.isDown:
    //   case cursors.d.isDown:
    //     anims.play(Animation.Right, true);
    //     break;

    //   case cursors.up.isDown:
    //   case cursors.w.isDown:
    //     anims.play(Animation.Up, true);
    //     break;

    //   case cursors.down.isDown:
    //   case cursors.s.isDown:
    //     anims.play(Animation.Down, true);
    //     break;

    //   default:
    anims.stop();

    // If we were moving, pick an idle frame to use
    switch (true) {
      case prevVelocity.x < 0:
        this.setTexture(key.atlas.player, "player-walk-west.000");
        break;
      case prevVelocity.x > 0:
        this.setTexture(key.atlas.player, "player-walk-east.000");
        break;
      case prevVelocity.y < 0:
        this.setTexture(key.atlas.player, "player-walk-north.000");
        break;
      case prevVelocity.y > 0:
        this.setTexture(key.atlas.player, "player-walk-south.000");
        break;
    }
    // }
  }
}
